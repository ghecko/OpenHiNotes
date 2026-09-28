import asyncio
from datetime import datetime
import uuid

from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import get_db
from app.dependencies import get_current_user
from app.models.summary import Summary, SummaryStatus, ACTIVE_SUMMARY_STATUSES
from app.models.template import SummaryTemplate
from app.models.transcription import Transcription
from app.models.user import User, UserRole
from app.schemas.summary import SummaryCreate, SummaryResponse
from app.services.llm import LLMService
from app.services.summary_queue import summary_queue

router = APIRouter(prefix="/summaries", tags=["summaries"])


async def _get_owned_transcription(
    db: AsyncSession, transcription_id: uuid.UUID, user: User, action: str
) -> Transcription:
    result = await db.execute(select(Transcription).where(Transcription.id == transcription_id))
    transcription = result.scalars().first()
    if not transcription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")
    if user.role != UserRole.admin and transcription.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Not authorized to {action} summaries for this transcription",
        )
    return transcription


async def _get_owned_summary(db: AsyncSession, summary_id: uuid.UUID, user: User, action: str) -> Summary:
    result = await db.execute(select(Summary).where(Summary.id == summary_id))
    summary = result.scalars().first()
    if not summary:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Summary not found")
    await _get_owned_transcription(db, summary.transcription_id, user, action)
    return summary


async def _to_response(db: AsyncSession, summaries: list[Summary]) -> list[SummaryResponse]:
    positions = {}
    if any(s.status == SummaryStatus.pending.value for s in summaries):
        positions = await summary_queue.queue_positions(db)
    out = []
    for s in summaries:
        r = SummaryResponse.model_validate(s)
        r.queue_position = positions.get(s.id)
        out.append(r)
    return out


@router.post("", response_model=SummaryResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_summary(
    summary_create: SummaryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Queue a summary for a transcription.

    Returns immediately with a `pending` summary; the summary queue fills it
    in the background. Poll `GET /summaries?transcription_id=` for progress.
    """
    transcription = await _get_owned_transcription(
        db, summary_create.transcription_id, current_user, "create"
    )
    if not transcription.text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transcription has no text content")

    template_id = None
    custom_prompt = None
    if summary_create.template_id:
        result = await db.execute(select(SummaryTemplate).where(SummaryTemplate.id == summary_create.template_id))
        if not result.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
        template_id = summary_create.template_id
    elif summary_create.custom_prompt and summary_create.custom_prompt.strip():
        custom_prompt = summary_create.custom_prompt
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either template_id or custom_prompt must be provided",
        )

    level = summary_create.reasoning_level
    if level and level != "default":
        features = await LLMService.get_features(db)
        allowed = [l["value"] for l in features["reasoning_levels"]]
        if level not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Reasoning level '{level}' is not available with the configured LLM "
                    f"(allowed: {', '.join(allowed) or 'none'})"
                ),
            )

    summary = await summary_queue.enqueue(
        db,
        transcription_id=transcription.id,
        template_id=template_id,
        custom_prompt=custom_prompt,
        reasoning_level=level,
    )
    return (await _to_response(db, [summary]))[0]


@router.get("", response_model=list[SummaryResponse])
async def list_summaries(
    transcription_id: uuid.UUID = Query(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List summaries for a transcription, oldest first, including in-progress ones."""
    await _get_owned_transcription(db, transcription_id, current_user, "view")
    result = await db.execute(
        select(Summary)
        .where(Summary.transcription_id == transcription_id)
        .order_by(Summary.created_at.asc())
        .offset(skip)
        .limit(limit)
    )
    return await _to_response(db, list(result.scalars().all()))


@router.get("/{summary_id}", response_model=SummaryResponse)
async def get_summary(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    summary = await _get_owned_summary(db, summary_id, current_user, "view")
    return (await _to_response(db, [summary]))[0]


@router.post("/{summary_id}/cancel", response_model=SummaryResponse)
async def cancel_summary(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop a queued or running summary."""
    summary = await _get_owned_summary(db, summary_id, current_user, "cancel")
    if summary.status not in ACTIVE_SUMMARY_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Summary is already {summary.status}")
    if not summary_queue.cancel(summary.id):
        # Not running (still pending, or orphaned): mark it directly.
        now = datetime.utcnow()
        await db.execute(
            update(Summary)
            .where(Summary.id == summary.id, Summary.status.in_(ACTIVE_SUMMARY_STATUSES))
            .values(status=SummaryStatus.cancelled.value, phase=None, error_message="Cancelled by user.",
                    completed_at=now, updated_at=now)
        )
        await db.commit()
    else:
        # The task records the cancellation itself; give it a moment so the
        # response already reflects it in the common case.
        for _ in range(20):
            await db.refresh(summary)
            if summary.status not in ACTIVE_SUMMARY_STATUSES:
                break
            await asyncio.sleep(0.1)
    await db.refresh(summary)
    return (await _to_response(db, [summary]))[0]


@router.post("/{summary_id}/retry", response_model=SummaryResponse)
async def retry_summary(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Queue a failed or cancelled summary again, with the same prompt and reasoning level."""
    summary = await _get_owned_summary(db, summary_id, current_user, "retry")
    if summary.status not in (SummaryStatus.failed.value, SummaryStatus.cancelled.value):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Summary is {summary.status}")
    now = datetime.utcnow()
    summary.status = SummaryStatus.pending.value
    summary.phase = "queued"
    summary.error_message = None
    summary.content = ""
    summary.reasoning = None
    summary.started_at = None
    summary.completed_at = None
    summary.updated_at = now
    summary.created_at = now  # back of the queue
    await db.commit()
    await db.refresh(summary)
    summary_queue.wake()
    return (await _to_response(db, [summary]))[0]


@router.patch("/{summary_id}", response_model=SummaryResponse)
async def update_summary_content(
    summary_id: uuid.UUID,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a summary's content (e.g. checkbox toggle)."""
    summary = await _get_owned_summary(db, summary_id, current_user, "update")
    if summary.status in ACTIVE_SUMMARY_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Summary is still being generated")
    if "content" in payload:
        summary.content = payload["content"]
    await db.commit()
    await db.refresh(summary)
    return (await _to_response(db, [summary]))[0]


@router.delete("/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_summary(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a summary (stops its generation if it is running)."""
    summary = await _get_owned_summary(db, summary_id, current_user, "delete")
    summary_queue.cancel(summary.id)
    await db.delete(summary)
    await db.commit()

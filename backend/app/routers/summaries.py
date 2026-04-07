from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas.summary import SummaryCreate, SummaryResponse
from app.models.summary import Summary
from app.models.transcription import Transcription
from app.models.template import SummaryTemplate
from app.models.user import User, UserRole
from app.dependencies import get_current_user
from app.services.llm import LLMService
from app.utils.date_extract import extract_meeting_date
import uuid

router = APIRouter(prefix="/summaries", tags=["summaries"])


@router.post("", response_model=SummaryResponse, status_code=status.HTTP_201_CREATED)
async def create_summary(
    summary_create: SummaryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new summary for a transcription."""
    # Get transcription
    result = await db.execute(
        select(Transcription).where(Transcription.id == summary_create.transcription_id)
    )
    transcription = result.scalars().first()

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create summary for this transcription",
        )

    if not transcription.text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcription has no text content",
        )

    # Build speaker-annotated transcript text if segments and speakers are available
    transcript_text = transcription.text
    if transcription.segments and transcription.speakers:
        speaker_map = transcription.speakers or {}
        annotated_parts = []
        prev_speaker = None
        for seg in transcription.segments:
            speaker_id = seg.get("speaker")
            speaker_name = speaker_map.get(speaker_id, speaker_id) if speaker_id else None
            text = seg.get("text", "").strip()
            if not text:
                continue
            if speaker_name and speaker_name != prev_speaker:
                annotated_parts.append(f"\n{speaker_name}: {text}")
                prev_speaker = speaker_name
            else:
                annotated_parts.append(f" {text}")
        if annotated_parts:
            transcript_text = "".join(annotated_parts).strip()

    # Get prompt - either from template or custom
    prompt = None
    template_id = None

    if summary_create.template_id:
        result = await db.execute(
            select(SummaryTemplate).where(SummaryTemplate.id == summary_create.template_id)
        )
        template = result.scalars().first()

        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template not found",
            )

        prompt = template.prompt_template
        template_id = template.id
    elif summary_create.custom_prompt:
        prompt = summary_create.custom_prompt
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either template_id or custom_prompt must be provided",
        )

    # Extract meeting date from device filename
    meeting_date = extract_meeting_date(transcription.original_filename)

    # Create summary via LLM
    try:
        summary_text, model_used = await LLMService.create_summary(
            transcript_text, prompt, summary_create.custom_prompt, db=db,
            meeting_date=meeting_date,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create summary: {str(e)}",
        )

    # Save summary to database
    summary = Summary(
        transcription_id=summary_create.transcription_id,
        template_id=template_id,
        content=summary_text,
        model_used=model_used,
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)

    return summary


@router.get("", response_model=list[SummaryResponse])
async def list_summaries(
    transcription_id: uuid.UUID = Query(...),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List summaries for a transcription."""
    # Get transcription to check authorization
    result = await db.execute(
        select(Transcription).where(Transcription.id == transcription_id)
    )
    transcription = result.scalars().first()

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view summaries for this transcription",
        )

    # Get summaries
    result = await db.execute(
        select(Summary)
        .where(Summary.transcription_id == transcription_id)
        .offset(skip)
        .limit(limit)
    )
    summaries = result.scalars().all()

    return summaries


@router.delete("/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_summary(
    summary_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a summary."""
    result = await db.execute(
        select(Summary).where(Summary.id == summary_id)
    )
    summary = result.scalars().first()

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found",
        )

    # Check authorization via transcription
    result = await db.execute(
        select(Transcription).where(Transcription.id == summary.transcription_id)
    )
    transcription = result.scalars().first()

    if transcription and current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this summary",
        )

    await db.delete(summary)
    await db.commit()

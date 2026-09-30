from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas.chat import ChatRequest, ChatMessage, ChatContext
from app.models.transcription import Transcription
from app.models.summary import Summary, SummaryStatus
from app.models.collection import Collection
from app.models.user import User, UserRole
from app.models.resource_share import ResourceType
from app.dependencies import get_current_user
from app.services.llm import LLMService, LLMError, reasoning_levels_for
from app.services.permissions import PermissionService
from app.utils.transcript_text import build_annotated_text
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


_build_annotated_text = build_annotated_text


async def _resolve_transcriptions(
    chat_request: ChatRequest,
    current_user: User,
    db: AsyncSession,
) -> list[Transcription]:
    """Resolve the set of transcriptions referenced by the chat request."""
    transcription_ids: list = []

    # Option 1: single transcription_id (backwards compatible)
    if chat_request.transcription_id:
        transcription_ids.append(chat_request.transcription_id)

    # Option 2: explicit list of IDs
    if chat_request.transcription_ids:
        for tid in chat_request.transcription_ids:
            if tid not in transcription_ids:
                transcription_ids.append(tid)

    # Option 3: all transcriptions in a collection
    if chat_request.collection_id:
        coll_result = await db.execute(
            select(Collection).where(Collection.id == chat_request.collection_id)
        )
        collection = coll_result.scalars().first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        has_access = await PermissionService.check_access(
            db, current_user, ResourceType.collection, chat_request.collection_id, "read"
        )
        if not has_access:
            raise HTTPException(status_code=403, detail="Not authorized")

        result = await db.execute(
            select(Transcription)
            .where(Transcription.collection_id == chat_request.collection_id)
            .order_by(Transcription.created_at)
        )
        for t in result.scalars().all():
            if t.id not in transcription_ids:
                transcription_ids.append(t.id)

    if not transcription_ids:
        return []

    # Fetch all transcriptions
    result = await db.execute(
        select(Transcription).where(Transcription.id.in_(transcription_ids))
    )
    transcriptions = list(result.scalars().all())

    # Check authorization via PermissionService
    for t in transcriptions:
        has_access = await PermissionService.check_access(
            db, current_user, ResourceType.transcription, t.id, "read"
        )
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not authorized to chat with transcription {t.id}",
            )

    return transcriptions


def _transcript_message(transcription: Transcription, ctx: ChatContext) -> Optional[ChatMessage]:
    """System message carrying the (possibly narrowed) transcript."""
    label = transcription.title or transcription.original_filename
    if not ctx.transcript:
        return None
    narrowed = ctx.speakers is not None or ctx.start is not None or ctx.end is not None
    text = build_annotated_text(
        transcription, speakers=ctx.speakers, start=ctx.start, end=ctx.end, timestamps=narrowed
    )
    if not text:
        return None
    if not narrowed:
        return ChatMessage(
            role="system",
            content=f"Here is the transcription ({label}) you are working with:\n\n{text}",
        )
    scope = []
    if ctx.speakers is not None:
        names = [(transcription.speakers or {}).get(s, s) for s in ctx.speakers]
        scope.append("only the turns of " + ", ".join(names) if names else "no speaker")
    if ctx.start is not None or ctx.end is not None:
        lo = _fmt_time(ctx.start or 0)
        hi = _fmt_time(ctx.end) if ctx.end is not None else "the end"
        scope.append(f"only the part between {lo} and {hi}")
    return ChatMessage(
        role="system",
        content=(
            f"Here is an excerpt of the transcription ({label}) you are working with "
            f"({'; '.join(scope)}). Other parts of the recording are not shown; say so if "
            f"the answer would need them.\n\n{text}"
        ),
    )


async def _summary_messages(
    db: AsyncSession, transcription: Transcription, ctx: ChatContext
) -> list[ChatMessage]:
    if not ctx.summary_ids:
        return []
    result = await db.execute(
        select(Summary)
        .where(Summary.id.in_(ctx.summary_ids), Summary.transcription_id == transcription.id)
        .order_by(Summary.created_at)
    )
    summaries = [s for s in result.scalars().all() if s.status == SummaryStatus.completed.value and s.content]
    missing = set(ctx.summary_ids) - {s.id for s in summaries}
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some selected summaries do not belong to this transcription or are not completed",
        )
    label = transcription.title or transcription.original_filename
    return [
        ChatMessage(
            role="system",
            content=f"Here is a summary of the transcription ({label}), generated with {s.model_used or 'the LLM'}:\n\n{s.content}",
        )
        for s in summaries
    ]


def _fmt_time(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


@router.post("", response_class=StreamingResponse)
async def chat(
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chat endpoint with optional transcription context (single or multiple).

    Streams SSE frames: ``{"phase"}``, ``{"reasoning"}``, ``{"content"}``,
    ``{"final"}``, ``{"warning"}``, ``{"done"}``, ``{"error"}``, then ``[DONE]``.
    """
    messages = list(chat_request.messages)

    transcriptions = await _resolve_transcriptions(chat_request, current_user, db)

    if len(transcriptions) == 1 and (chat_request.context or chat_request.transcription_id):
        ctx = chat_request.context or ChatContext()
        if ctx.start is not None and ctx.end is not None and ctx.end < ctx.start:
            raise HTTPException(status_code=400, detail="Context end must be after its start")
        context_messages = await _summary_messages(db, transcriptions[0], ctx)
        transcript_message = _transcript_message(transcriptions[0], ctx)
        if transcript_message:
            context_messages.insert(0, transcript_message)
        messages[0:0] = context_messages
    elif transcriptions:
        # Multiple transcripts — concatenate with clear separators
        parts = []
        for t in transcriptions:
            label = t.title or t.original_filename
            text = _build_annotated_text(t)
            if text:
                parts.append(f"=== {label} ===\n{text}")
        if parts:
            combined = "\n\n".join(parts)
            transcript_message = ChatMessage(
                role="system",
                content=(
                    f"Here are {len(parts)} transcriptions you are working with. "
                    f"They are separated by === headers ===.\n\n{combined}"
                ),
            )
            messages.insert(0, transcript_message)

    cfg = await LLMService.resolve_settings(db)
    level = chat_request.reasoning_level
    if level and level != "default" and level not in reasoning_levels_for(cfg["reasoning_control"]):
        raise HTTPException(status_code=400, detail=f"Unsupported reasoning level '{level}'")

    # Create streaming response
    async def generate():
        try:
            async for event in LLMService.chat_events(
                messages,
                model=chat_request.model,
                temperature=chat_request.temperature,
                max_tokens=chat_request.max_tokens,
                reasoning_level=level,
                db=db,
            ):
                yield f"data: {json.dumps(event)}\n\n"

            # Send end marker
            yield "data: [DONE]\n\n"
        except LLMError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except Exception as e:
            logger.exception("Chat generation failed")
            yield f"data: {json.dumps({'error': f'Chat failed: {e}'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas.chat import ChatRequest, ChatMessage
from app.models.transcription import Transcription
from app.models.collection import Collection
from app.models.user import User, UserRole
from app.dependencies import get_current_user
from app.services.llm import LLMService
import json

router = APIRouter(prefix="/chat", tags=["chat"])


def _build_annotated_text(transcription: Transcription) -> str:
    """Build speaker-annotated transcript text from a Transcription object."""
    transcript_text = transcription.text or ""
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
    return transcript_text


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
        if current_user.role != UserRole.admin and collection.user_id != current_user.id:
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

    # Check authorization
    for t in transcriptions:
        if current_user.role != UserRole.admin and t.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not authorized to chat with transcription {t.id}",
            )

    return transcriptions


@router.post("", response_class=StreamingResponse)
async def chat(
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chat endpoint with optional transcription context (single or multiple)."""
    messages = list(chat_request.messages)

    transcriptions = await _resolve_transcriptions(chat_request, current_user, db)

    if transcriptions:
        if len(transcriptions) == 1:
            # Single transcript — original behavior
            transcript_text = _build_annotated_text(transcriptions[0])
            if transcript_text:
                label = transcriptions[0].title or transcriptions[0].original_filename
                transcript_message = ChatMessage(
                    role="system",
                    content=f"Here is the transcription ({label}) you are working with:\n\n{transcript_text}",
                )
                messages.insert(0, transcript_message)
        else:
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

    # Create streaming response
    async def generate():
        try:
            async for chunk in LLMService.chat_completion(
                messages,
                model=chat_request.model,
                temperature=chat_request.temperature,
                max_tokens=chat_request.max_tokens,
                db=db,
            ):
                # Send as SSE
                event_data = json.dumps({"content": chunk})
                yield f"data: {event_data}\n\n"

            # Send end marker
            yield "data: [DONE]\n\n"
        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

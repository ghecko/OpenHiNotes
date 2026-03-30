from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas.chat import ChatRequest, ChatMessage
from app.models.transcription import Transcription
from app.models.user import User, UserRole
from app.dependencies import get_current_user
from app.services.llm import LLMService
import json

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_class=StreamingResponse)
async def chat(
    chat_request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chat endpoint with optional transcription context."""
    # If transcription_id is provided, verify access and prepend transcript
    messages = list(chat_request.messages)

    if chat_request.transcription_id:
        result = await db.execute(
            select(Transcription).where(Transcription.id == chat_request.transcription_id)
        )
        transcription = result.scalars().first()

        if not transcription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription not found",
            )

        # Check authorization
        if (
            current_user.role != UserRole.admin
            and transcription.user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to chat with this transcription",
            )

        # Prepend transcript as system message
        if transcription.text:
            transcript_message = ChatMessage(
                role="system",
                content=f"Here is the transcription you are working with:\n\n{transcription.text}",
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

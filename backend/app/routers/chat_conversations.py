from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas.chat_conversation import (
    ChatConversationCreate,
    ChatConversationUpdate,
    ChatConversationResponse,
    ChatConversationListItem,
)
from app.models.chat_conversation import ChatConversation
from app.models.transcription import Transcription
from app.models.user import User, UserRole
from app.models.resource_share import ResourceType
from app.dependencies import get_current_user
from app.services.permissions import PermissionService
import uuid
from typing import List

router = APIRouter(prefix="/chat-conversations", tags=["chat-conversations"])


@router.post("", response_model=ChatConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ChatConversationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a chat conversation."""
    # If linked to a transcription, verify access
    if data.transcription_id:
        result = await db.execute(
            select(Transcription).where(Transcription.id == data.transcription_id)
        )
        transcription = result.scalars().first()
        if not transcription:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")
        has_access = await PermissionService.check_access(
            db, current_user, ResourceType.transcription, data.transcription_id, "read"
        )
        if not has_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    conversation = ChatConversation(
        transcription_id=data.transcription_id,
        user_id=current_user.id,
        title=data.title,
        messages=[m.model_dump() for m in data.messages],
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("", response_model=list[ChatConversationListItem])
async def list_conversations(
    transcription_id: uuid.UUID = Query(None),
    collection_id: uuid.UUID = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List chat conversations, optionally filtered by transcription or collection."""
    query = select(ChatConversation).offset(skip).limit(limit)

    if current_user.role != UserRole.admin:
        query = query.where(ChatConversation.user_id == current_user.id)

    if transcription_id:
        query = query.where(ChatConversation.transcription_id == transcription_id)
    elif collection_id:
        # Filter to conversations linked to transcriptions in this collection
        t_result = await db.execute(
            select(Transcription.id).where(Transcription.collection_id == collection_id)
        )
        collection_transcription_ids = [row[0] for row in t_result.all()]
        if collection_transcription_ids:
            query = query.where(
                ChatConversation.transcription_id.in_(collection_transcription_ids)
            )
        else:
            # No transcriptions in collection — return empty
            return []

    query = query.order_by(ChatConversation.updated_at.desc())

    result = await db.execute(query)
    conversations = result.scalars().all()

    # Resolve transcription names for conversations linked to transcriptions
    transcription_ids = {c.transcription_id for c in conversations if c.transcription_id}
    name_map: dict[uuid.UUID, str] = {}
    if transcription_ids:
        t_result = await db.execute(
            select(Transcription.id, Transcription.title, Transcription.original_filename)
            .where(Transcription.id.in_(transcription_ids))
        )
        for tid, title, original_filename in t_result.all():
            name_map[tid] = title or original_filename or str(tid)

    # Build response with transcription_name populated
    items = []
    for c in conversations:
        item = ChatConversationListItem.model_validate(c)
        if c.transcription_id and c.transcription_id in name_map:
            item.transcription_name = name_map[c.transcription_id]
        items.append(item)

    return items


@router.get("/{conversation_id}", response_model=ChatConversationResponse)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single chat conversation with messages."""
    result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conversation_id)
    )
    conversation = result.scalars().first()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    if current_user.role != UserRole.admin and conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    return conversation


@router.put("/{conversation_id}", response_model=ChatConversationResponse)
async def update_conversation(
    conversation_id: uuid.UUID,
    data: ChatConversationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a chat conversation (e.g. add new messages)."""
    result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conversation_id)
    )
    conversation = result.scalars().first()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    if current_user.role != UserRole.admin and conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if data.title is not None:
        conversation.title = data.title
    if data.messages is not None:
        conversation.messages = [m.model_dump() for m in data.messages]

    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a chat conversation."""
    result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conversation_id)
    )
    conversation = result.scalars().first()

    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    if current_user.role != UserRole.admin and conversation.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    await db.delete(conversation)
    await db.commit()

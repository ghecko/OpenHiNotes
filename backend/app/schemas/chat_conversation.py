from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime


class ChatMessageData(BaseModel):
    """Schema for a single chat message within a conversation."""
    role: str  # "user" or "assistant"
    content: str


class ChatConversationCreate(BaseModel):
    """Schema for creating a chat conversation."""
    transcription_id: Optional[uuid.UUID] = None
    title: str
    messages: List[ChatMessageData]


class ChatConversationUpdate(BaseModel):
    """Schema for updating a chat conversation."""
    title: Optional[str] = None
    messages: Optional[List[ChatMessageData]] = None


class ChatConversationResponse(BaseModel):
    """Schema for chat conversation response."""
    id: uuid.UUID
    transcription_id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    title: str
    messages: List[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatConversationListItem(BaseModel):
    """Schema for chat conversation in list view (without messages)."""
    id: uuid.UUID
    transcription_id: Optional[uuid.UUID] = None
    user_id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

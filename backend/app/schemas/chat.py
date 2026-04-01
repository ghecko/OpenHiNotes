from pydantic import BaseModel
from typing import Optional, List
import uuid


class ChatMessage(BaseModel):
    """Schema for a chat message."""
    role: str  # "system", "user", "assistant"
    content: str


class ChatRequest(BaseModel):
    """Schema for chat request."""
    messages: List[ChatMessage]
    transcription_id: Optional[uuid.UUID] = None
    transcription_ids: Optional[List[uuid.UUID]] = None  # For multi-transcript (collection) chat
    collection_id: Optional[uuid.UUID] = None  # Convenience: chat with all transcriptions in a collection
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None

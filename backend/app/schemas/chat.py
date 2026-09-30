from pydantic import BaseModel, Field
from typing import Optional, List
import uuid


class ChatMessage(BaseModel):
    """Schema for a chat message."""
    role: str  # "system", "user", "assistant"
    content: str


class ChatContext(BaseModel):
    """What the model gets to see about a transcription.

    Everything is optional so an old client (no ``context`` at all) keeps the
    original behaviour: the whole speaker-annotated transcript.
    """
    # Include the transcript at all (False = summaries only, or nothing).
    transcript: bool = True
    # Keep only the turns of these speaker labels (SPEAKER_00, ...); None = all.
    speakers: Optional[List[str]] = None
    # Keep only the segments overlapping [start, end] seconds; None = whole recording.
    start: Optional[float] = Field(default=None, ge=0)
    end: Optional[float] = Field(default=None, ge=0)
    # Summaries of the transcription to include verbatim (must be completed).
    summary_ids: List[uuid.UUID] = Field(default_factory=list)


class ChatRequest(BaseModel):
    """Schema for chat request."""
    messages: List[ChatMessage]
    transcription_id: Optional[uuid.UUID] = None
    transcription_ids: Optional[List[uuid.UUID]] = None  # For multi-transcript (collection) chat
    collection_id: Optional[uuid.UUID] = None  # Convenience: chat with all transcriptions in a collection
    model: Optional[str] = None
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = None
    # Thinking level for this reply ("default" / None = admin default).
    reasoning_level: Optional[str] = None
    # Applies to the single-transcription case (transcription_id).
    context: Optional[ChatContext] = None

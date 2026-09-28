from pydantic import BaseModel, Field
from typing import Optional, Literal
import uuid
from datetime import datetime

ReasoningLevel = Literal["default", "off", "on", "low", "medium", "high"]


class SummaryCreate(BaseModel):
    """Schema for creating a summary."""
    transcription_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None
    custom_prompt: Optional[str] = None
    # "default" (or omitted) = the admin's llm_reasoning_default.
    reasoning_level: Optional[ReasoningLevel] = None


class SummaryResponse(BaseModel):
    """Schema for summary response."""
    id: uuid.UUID
    transcription_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None
    content: str
    model_used: str
    created_at: datetime
    status: str = "completed"
    phase: Optional[str] = None
    error_message: Optional[str] = None
    reasoning_level: Optional[str] = None
    reasoning: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Position in the summary queue when pending (1 = next), None otherwise.
    queue_position: Optional[int] = Field(default=None)

    model_config = {"from_attributes": True, "protected_namespaces": ()}

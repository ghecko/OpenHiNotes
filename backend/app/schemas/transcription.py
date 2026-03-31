from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid
from datetime import datetime


class TranscriptionCreate(BaseModel):
    """Schema for transcription creation."""
    language: Optional[str] = None
    auto_summarize: bool = False
    template_id: Optional[uuid.UUID] = None


class SpeakersUpdate(BaseModel):
    """Schema for updating speaker mappings."""
    speakers: Dict[str, str]


class NotesUpdate(BaseModel):
    """Schema for updating transcription notes."""
    notes: Optional[str] = None


class TitleUpdate(BaseModel):
    """Schema for updating transcription title."""
    title: Optional[str] = None


class SegmentResponse(BaseModel):
    """Schema for a transcription segment."""
    start: float
    end: float
    text: str
    speaker: Optional[str] = None


class TranscriptionResponse(BaseModel):
    """Schema for transcription response."""
    id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    original_filename: str
    title: Optional[str] = None
    audio_duration: Optional[float] = None
    language: Optional[str] = None
    text: Optional[str] = None
    segments: Optional[List[Dict[str, Any]]] = None
    speakers: Optional[Dict[str, str]] = None
    status: str
    error_message: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TranscriptionUpdate(BaseModel):
    """Schema for transcription updates."""
    speakers: Optional[Dict[str, str]] = None
    notes: Optional[str] = None


class PaginatedTranscriptionResponse(BaseModel):
    """Schema for a paginated list of transcriptions."""
    items: List[TranscriptionResponse]
    total: int
    skip: int
    limit: int

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


class SegmentSpeakerReassign(BaseModel):
    """Schema for reassigning a speaker on specific segments."""
    segment_indices: List[int]
    new_speaker: str


class SegmentTextUpdate(BaseModel):
    """Schema for updating the text of a specific segment."""
    segment_index: int
    text: str


class TranscriptFindReplace(BaseModel):
    """Schema for finding and replacing text across all segments."""
    find: str
    replace: str
    case_sensitive: bool = False


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
    recording_type: str = "record"
    title: Optional[str] = None
    collection_id: Optional[uuid.UUID] = None
    audio_duration: Optional[float] = None
    language: Optional[str] = None
    text: Optional[str] = None
    segments: Optional[List[Dict[str, Any]]] = None
    speakers: Optional[Dict[str, str]] = None
    status: str
    error_message: Optional[str] = None
    notes: Optional[str] = None
    queue_position: Optional[int] = None
    progress: Optional[float] = None
    progress_stage: Optional[str] = None
    queued_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    keep_audio: bool = False
    audio_available: bool = False
    created_at: datetime
    updated_at: datetime
    # Access control fields (populated by routers, not from DB)
    permission_level: Optional[str] = None  # "owner" | "write" | "read"
    shared_by: Optional[str] = None  # display name of who shared it

    class Config:
        from_attributes = True


class TranscriptionUpdate(BaseModel):
    """Schema for transcription updates."""
    speakers: Optional[Dict[str, str]] = None
    notes: Optional[str] = None


class QueueStatusResponse(BaseModel):
    """Queue status for all active/queued transcriptions."""
    queue: List[TranscriptionResponse]
    total_in_queue: int
    currently_processing: Optional[TranscriptionResponse] = None


class PaginatedTranscriptionResponse(BaseModel):
    """Schema for a paginated list of transcriptions."""
    items: List[TranscriptionResponse]
    total: int
    skip: int
    limit: int

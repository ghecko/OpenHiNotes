from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
import uuid
from datetime import datetime


class TranscriptionCreate(BaseModel):
    """Schema for transcription creation."""
    language: Optional[str] = None
    auto_summarize: bool = False
    template_id: Optional[uuid.UUID] = None
    num_speakers: Optional[int] = None


class SpeakerMerge(BaseModel):
    """Merge every segment of `source` into speaker `target` (fixes pyannote
    over-segmentation of one person into two labels)."""
    source: str
    target: str


class SpeakerMatchDecision(BaseModel):
    """User verdict on an automatic voice-fingerprint identification."""
    action: Literal["confirm", "reject"]
    # On confirm: also enrol this recording's voice as a new profile sample
    # for the matched user (requires the audio to still be available).
    enroll: bool = False


class SpeakerEnrollRequest(BaseModel):
    """Save one diarized speaker of a transcription as a voice profile."""
    # Target user. Omitted = the current user. Another user requires admin.
    user_id: Optional[uuid.UUID] = None
    label: Optional[str] = None


class SpeakerEnrollResponse(BaseModel):
    profile_id: uuid.UUID
    user_id: uuid.UUID
    label: str
    source: Literal["stored", "audio"]


class VoiceSourcesResponse(BaseModel):
    """What can be used to enrol each speaker of a transcription."""
    fingerprinting_enabled: bool
    retention_enabled: bool
    audio_available: bool
    # label -> "stored" | "audio" | null
    sources: Dict[str, Optional[Literal["stored", "audio"]]]


class SpeakerMatchInfo(BaseModel):
    profile_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None
    display_name: Optional[str] = None
    distance: Optional[float] = None
    confidence: Optional[float] = None
    status: Literal["auto", "confirmed", "rejected", "unmatched"] = "auto"


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


class SegmentSplit(BaseModel):
    """Split a segment before word `word_index` (requires word timestamps)."""
    segment_index: int
    word_index: int
    new_speaker: Optional[str] = None


class SegmentTextUpdate(BaseModel):
    """Schema for updating the text of a specific segment."""
    segment_index: int
    text: str


class TranscriptFindReplace(BaseModel):
    """Schema for finding and replacing text across all segments."""
    find: str
    replace: str
    case_sensitive: bool = False


class WordResponse(BaseModel):
    """One aligned word (wordalign pipeline)."""
    word: str
    start: float
    end: float
    score: Optional[float] = None


class SegmentResponse(BaseModel):
    """Schema for a transcription segment."""
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    confidence: Optional[float] = None
    words: Optional[List[WordResponse]] = None


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
    auto_summarize: bool = False
    auto_summarize_template_id: Optional[uuid.UUID] = None
    is_pinned: bool = False
    failed_audio_expires_at: Optional[datetime] = None
    combined_sources: Optional[List[str]] = None
    num_speakers: Optional[int] = None
    speaker_matches: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    permission_level: Optional[str] = None
    shared_by: Optional[str] = None

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

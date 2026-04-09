"""Pydantic schemas for voice profile endpoints."""

from pydantic import BaseModel
from typing import Optional, List
import uuid
from datetime import datetime


class VoiceProfileCreate(BaseModel):
    """Schema for creating a voice profile (label only — embedding comes from audio)."""
    label: str = "My voice"


class VoiceProfileResponse(BaseModel):
    """Schema for voice profile response (never exposes the raw embedding)."""
    id: uuid.UUID
    user_id: uuid.UUID
    label: str
    embedding_dim: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VoiceProfileListResponse(BaseModel):
    """Schema for listing voice profiles."""
    profiles: List[VoiceProfileResponse]
    total: int


class SpeakerMatchResult(BaseModel):
    """Result of matching a speaker embedding against known profiles."""
    speaker_label: str          # Original label, e.g. "SPEAKER_00"
    matched_user_id: Optional[uuid.UUID] = None
    matched_display_name: Optional[str] = None
    matched_profile_id: Optional[uuid.UUID] = None
    confidence: Optional[float] = None  # 1.0 - cosine_distance (higher = better)
    distance: Optional[float] = None    # Raw cosine distance

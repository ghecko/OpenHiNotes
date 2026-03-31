from sqlalchemy import String, Float, Enum as SQLEnum, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from enum import Enum
from app.database import Base


class TranscriptionStatus(str, Enum):
    """Transcription status enumeration."""
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Transcription(Base):
    """Transcription model for audio files and their transcripts."""

    __tablename__ = "transcriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=True)
    audio_duration: Mapped[float] = mapped_column(Float, nullable=True)
    language: Mapped[str] = mapped_column(String(10), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=True)
    segments: Mapped[dict] = mapped_column(JSON, nullable=True, default=list)
    speakers: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    status: Mapped[TranscriptionStatus] = mapped_column(
        SQLEnum(TranscriptionStatus), default=TranscriptionStatus.pending, nullable=False
    )
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship(foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<Transcription(id={self.id}, user_id={self.user_id}, status={self.status})>"

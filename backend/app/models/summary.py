from enum import Enum
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from app.database import Base


class SummaryStatus(str, Enum):
    """Lifecycle of a summary generated in the background (services/summary_queue.py)."""
    pending = "pending"        # queued, waiting for an LLM slot
    processing = "processing"  # LLM call in flight (see `phase`)
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


ACTIVE_SUMMARY_STATUSES = (SummaryStatus.pending.value, SummaryStatus.processing.value)


class Summary(Base):
    """Summary model for generated transcription summaries."""

    __tablename__ = "summaries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    transcription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcriptions.id"), nullable=False, index=True
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("summary_templates.id"), nullable=True
    )
    # Empty while the summary is pending; filled progressively while writing.
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_used: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Background generation state. Plain strings (not a PG enum) so adding a
    # status later needs no type migration; values are SummaryStatus.
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SummaryStatus.pending.value,
        server_default=SummaryStatus.completed.value, index=True,
    )
    # "queued" | "thinking" | "writing" while processing, None otherwise.
    phase: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Failure reason, or a warning on a completed summary (e.g. truncated output).
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Prompt used when no template was given (kept so the summary can be retried).
    custom_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Requested reasoning level ("off", "on", "low", "medium", "high"); None = admin default.
    reasoning_level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # The model's reasoning, split out of the answer (reasoning_content / <think>).
    reasoning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # Bumped on every progress write; lets the UI tell a live job from a stuck one.
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    transcription: Mapped["Transcription"] = relationship(foreign_keys=[transcription_id])
    template: Mapped["SummaryTemplate"] = relationship(foreign_keys=[template_id])

    def __repr__(self) -> str:
        return f"<Summary(id={self.id}, transcription_id={self.transcription_id}, status={self.status})>"

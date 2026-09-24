"""Per-transcription speaker embeddings (optional retention).

When the admin enables ``speaker_embedding_retention_enabled``, the voice
embedding VoxHub computes for every diarized speaker is kept, encrypted with
the same AES-256-GCM scheme as ``VoiceProfile``. This is what makes
"save this speaker as a voice profile" possible weeks later, after the audio
has been deleted, and what lets a user's profile be enriched from a meeting
they simply confirmed.

Rows are biometric data: they are cascade-deleted with the transcription,
purgeable by an admin in one call, and never returned to the client (only
their existence is).
"""

from sqlalchemy import DateTime, Float, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
import uuid
from datetime import datetime
from app.database import Base


class TranscriptionSpeakerEmbedding(Base):
    __tablename__ = "transcription_speaker_embeddings"
    __table_args__ = (
        UniqueConstraint("transcription_id", "speaker_label", name="uq_tse_transcription_speaker"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    transcription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Diarization label at transcription time (SPEAKER_00, ...). Merges and
    # renames in the UI do not rewrite it, so the UI resolves through the
    # transcription's current segments.
    speaker_label: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    encryption_nonce: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    encryption_tag: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)
    embedding_dim: Mapped[int] = mapped_column(Integer, default=512, nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(100), nullable=False, default="pyannote/embedding")
    speech_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<TranscriptionSpeakerEmbedding(transcription={self.transcription_id}, speaker={self.speaker_label})>"

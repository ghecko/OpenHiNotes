"""Voice profile model for speaker voice fingerprinting.

Each user can record one or more voice samples. The resulting embedding
(a 512-dimensional float vector from pyannote/embedding) is encrypted
at rest using AES-256-GCM to protect biometric data per GDPR requirements.

Embeddings are decrypted only in memory when performing speaker matching
during transcription. When a user is deactivated or deletes their profile,
the corresponding rows (and thus the encrypted embeddings) are removed.
"""

from sqlalchemy import String, Boolean, DateTime, ForeignKey, LargeBinary, Float
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from app.database import Base


class VoiceProfile(Base):
    """Stores an encrypted speaker embedding for a user.

    Fields:
        id: Primary key (UUID).
        user_id: FK to users table. Cascade-deleted when user is removed.
        label: Human-readable label (e.g. "My voice", "Office mic recording").
        encrypted_embedding: AES-256-GCM encrypted 512-dim float vector.
        encryption_nonce: 12-byte nonce used for GCM encryption (unique per row).
        encryption_tag: 16-byte GCM authentication tag.
        embedding_dim: Dimensionality of the embedding (always 512 for pyannote).
        is_active: Soft-delete flag. Inactive profiles are excluded from matching.
        created_at / updated_at: Timestamps.
    """

    __tablename__ = "voice_profiles"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="My voice")
    encrypted_embedding: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    encryption_nonce: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    encryption_tag: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)
    embedding_dim: Mapped[int] = mapped_column(default=512, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationship
    user: Mapped["User"] = relationship(foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<VoiceProfile(id={self.id}, user_id={self.user_id}, label={self.label})>"

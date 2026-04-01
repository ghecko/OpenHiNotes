from sqlalchemy import String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from app.database import Base


class ChatConversation(Base):
    """Model for saved chat conversations, optionally linked to a transcription."""

    __tablename__ = "chat_conversations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    transcription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcriptions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    messages: Mapped[dict] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    transcription: Mapped["Transcription"] = relationship(foreign_keys=[transcription_id])
    user: Mapped["User"] = relationship(foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<ChatConversation(id={self.id}, user_id={self.user_id}, transcription_id={self.transcription_id})>"

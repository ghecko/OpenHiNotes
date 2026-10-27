from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import mapped_column, Mapped
import uuid
from datetime import datetime
from app.database import Base


class CollectionTranscription(Base):
    """Membership of a transcription in a collection.

    A transcription can be in several collections, including collections of
    users it was shared with (they organise it without touching the owner's
    collections). ``added_by_id`` records who put it there: sharing a
    collection only grants access to the transcriptions their owner added
    themselves (see PermissionService), so nobody can re-share someone
    else's transcription by dropping it into their own shared collection.
    """

    __tablename__ = "collection_transcriptions"

    collection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    transcription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("transcriptions.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    added_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<CollectionTranscription(collection_id={self.collection_id}, transcription_id={self.transcription_id})>"

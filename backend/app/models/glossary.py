from sqlalchemy import String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import mapped_column, Mapped
import uuid
from datetime import datetime
from app.database import Base


class GlossaryTerm(Base):
    """A correctly spelled term the speech recognizer tends to get wrong.

    A term with no collection belongs to its owner's general vocabulary and
    applies to all of their transcriptions; a term with a collection applies
    to the transcriptions in that collection (e.g. a "Pentest" collection
    with "Burp Suite", "WriteHat"). ``aliases`` are mis-transcriptions seen
    so far ("Voxub", "VoxSub" for "VoxHub"): they are examples for the LLM,
    never applied blindly to transcripts, since the recognizer's errors are
    not predictable enough for that.
    """

    __tablename__ = "glossary_terms"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    collection_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("collections.id", ondelete="CASCADE"), nullable=True, index=True
    )
    term: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<GlossaryTerm(id={self.id}, term={self.term}, collection_id={self.collection_id})>"

from sqlalchemy import String, DateTime, ForeignKey, Text, Boolean, Enum as SQLEnum
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional
from app.database import Base


class TemplateTargetType(str, Enum):
    """Which recording types a template is designed for."""
    record = "record"
    whisper = "whisper"
    both = "both"


class TemplateVisibility(str, Enum):
    """Lifecycle/visibility state for a template.

    - `private`: visible only to the creator (default for user-created templates).
    - `pending_review`: submitted by the creator for admin approval. Visible to
      creator + admins only — not to other regular users.
    - `public`: approved, visible to all users. Once public, the template is
      admin-owned; the original creator can no longer edit it.
    """
    private = "private"
    pending_review = "pending_review"
    public = "public"


class SummaryTemplate(Base):
    """Summary template model for reusable summarization prompts."""

    __tablename__ = "summary_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    target_type: Mapped[TemplateTargetType] = mapped_column(
        SQLEnum(TemplateTargetType), default=TemplateTargetType.both, nullable=False, server_default="both"
    )
    # Visibility defaults to `public` in Python so the existing admin-create flow
    # keeps producing public templates without explicit changes. The user-create
    # endpoint explicitly overrides this to `private`.
    visibility: Mapped[TemplateVisibility] = mapped_column(
        SQLEnum(TemplateVisibility),
        default=TemplateVisibility.public,
        nullable=False,
        server_default="public",
        index=True,
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    reviewer: Mapped[Optional["User"]] = relationship(foreign_keys=[reviewed_by])

    def __repr__(self) -> str:
        return f"<SummaryTemplate(id={self.id}, name={self.name!r}, visibility={self.visibility.value if hasattr(self.visibility, 'value') else self.visibility})>"

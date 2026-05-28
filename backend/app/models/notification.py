from sqlalchemy import String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import mapped_column, Mapped
import uuid
from datetime import datetime
from app.database import Base


class Notification(Base):
    """Lightweight in-app notification for a single user.

    `type` is a free-form discriminator (e.g. "template_approved",
    "template_rejected") used by the frontend to pick icons/labels.
    `link` is an optional in-app route the UI can navigate to on click.
    """

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=True)
    link: Mapped[str] = mapped_column(String(512), nullable=True)
    is_read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, user_id={self.user_id}, type={self.type!r}, read={self.is_read})>"

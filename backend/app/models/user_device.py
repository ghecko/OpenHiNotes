from sqlalchemy import String, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import mapped_column, Mapped
import uuid
from datetime import datetime
from app.database import Base


class UserDevice(Base):
    """A HiDock a user has connected, and the recordings it held at that time.

    ``file_names`` is the device's file list as of ``files_seen_at`` (the last
    time it was connected and listed). It answers "is this recording on a
    device that is simply not plugged in right now?", which the connected
    device alone cannot tell once a user owns several.
    """

    __tablename__ = "user_devices"
    __table_args__ = (UniqueConstraint("user_id", "serial", name="uq_user_devices_user_serial"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    serial: Mapped[str] = mapped_column(String(64), nullable=False)
    # Device model id as the frontend names it ("hidock-h1", "hidock-p1", ...)
    model: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Name the user gave the device ("Desk P1"); NULL = show the model
    name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    file_names: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    files_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<UserDevice(user_id={self.user_id}, serial={self.serial}, model={self.model})>"

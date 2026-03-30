from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import mapped_column, Mapped
from datetime import datetime
from app.database import Base


class AppSetting(Base):
    """Key-value settings table for runtime configuration."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<AppSetting(key={self.key}, value={self.value[:50]})>"

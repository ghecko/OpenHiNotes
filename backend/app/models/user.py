from sqlalchemy import String, Boolean, Enum as SQLEnum, DateTime, Text, JSON
from sqlalchemy.orm import mapped_column, Mapped
import uuid
from datetime import datetime
from typing import Optional
from enum import Enum
from app.database import Base


class UserRole(str, Enum):
    """User role enumeration."""
    admin = "admin"
    user = "user"


class UserStatus(str, Enum):
    """User account status."""
    active = "active"
    pending = "pending"       # awaiting admin approval
    rejected = "rejected"     # admin rejected the registration


class RegistrationSource(str, Enum):
    """How the user account was created."""
    self_registered = "self_registered"
    admin_created = "admin_created"
    oidc = "oidc"


class User(Base):
    """User model for authentication and authorization."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.user, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        SQLEnum(UserStatus), default=UserStatus.active, nullable=False, server_default="active"
    )
    registration_source: Mapped[RegistrationSource] = mapped_column(
        SQLEnum(RegistrationSource), default=RegistrationSource.self_registered,
        nullable=False, server_default="self_registered"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Password reset fields
    force_password_reset: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    password_reset_token: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, default=None
    )
    password_reset_token_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, default=None
    )

    # Client-side recording aliases: filename → display name
    recording_aliases: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict, server_default='{}'
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
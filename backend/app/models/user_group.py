from sqlalchemy import String, DateTime, ForeignKey, Text, Table, Column, Enum as SQLEnum
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from enum import Enum
from app.database import Base


class SharingPolicy(str, Enum):
    creator_only = "creator_only"      # only the group owner can share resources to this group
    members_allowed = "members_allowed"  # any member can share resources to this group


# Association table for group membership (M:N)
user_group_members = Table(
    "user_group_members",
    Base.metadata,
    Column("group_id", ForeignKey("user_groups.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("added_at", DateTime, default=datetime.utcnow, nullable=False),
)


class UserGroup(Base):
    """User group for organizing users and sharing resources."""

    __tablename__ = "user_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    # owner_id tracks the current owner (defaults to creator, transferable in future)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    sharing_policy: Mapped[SharingPolicy] = mapped_column(
        SQLEnum(SharingPolicy),
        nullable=False,
        default=SharingPolicy.creator_only,
        server_default="creator_only",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    creator: Mapped["User"] = relationship(foreign_keys=[created_by])
    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])
    members: Mapped[list["User"]] = relationship(
        secondary=user_group_members, lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<UserGroup(id={self.id}, name={self.name})>"

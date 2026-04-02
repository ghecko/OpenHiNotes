from sqlalchemy import String, DateTime, ForeignKey, Enum as SQLEnum, Index
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from enum import Enum
from app.database import Base


class ResourceType(str, Enum):
    """Type of shared resource."""
    transcription = "transcription"
    collection = "collection"


class GranteeType(str, Enum):
    """Type of share recipient."""
    user = "user"
    group = "group"


class PermissionLevel(str, Enum):
    """Permission level for shared resources."""
    read = "read"
    write = "write"  # write implies read


class ResourceShare(Base):
    """Polymorphic sharing table — links resources to users or groups with permissions."""

    __tablename__ = "resource_shares"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    resource_type: Mapped[ResourceType] = mapped_column(
        SQLEnum(ResourceType), nullable=False
    )
    resource_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    grantee_type: Mapped[GranteeType] = mapped_column(
        SQLEnum(GranteeType), nullable=False
    )
    grantee_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    permission: Mapped[PermissionLevel] = mapped_column(
        SQLEnum(PermissionLevel), default=PermissionLevel.read, nullable=False
    )
    granted_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    granter: Mapped["User"] = relationship(foreign_keys=[granted_by])

    __table_args__ = (
        Index("ix_resource_shares_resource", "resource_type", "resource_id"),
        Index("ix_resource_shares_grantee", "grantee_type", "grantee_id"),
        # Prevent duplicate shares
        Index(
            "uq_resource_shares_unique",
            "resource_type", "resource_id", "grantee_type", "grantee_id",
            unique=True,
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<ResourceShare(resource={self.resource_type}:{self.resource_id}, "
            f"grantee={self.grantee_type}:{self.grantee_id}, "
            f"permission={self.permission})>"
        )

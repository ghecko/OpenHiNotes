"""User Identity model for linking users to external OIDC providers.

A user can have multiple identities (e.g., local password + Google SSO + Microsoft SSO).
The composite unique constraint on (provider_id, subject) ensures one identity per
provider-user pair.
"""

from sqlalchemy import String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import mapped_column, Mapped, relationship
import uuid
from datetime import datetime
from app.database import Base


class UserIdentity(Base):
    """Links a user to an external OIDC identity."""

    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("provider_id", "subject", name="uq_identity_provider_subject"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("oidc_providers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    raw_claims: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    last_login: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", backref="identities", lazy="selectin")
    provider = relationship("OIDCProvider", backref="identities", lazy="selectin")

    def __repr__(self) -> str:
        return f"<UserIdentity(user_id={self.user_id}, provider_id={self.provider_id}, subject={self.subject})>"

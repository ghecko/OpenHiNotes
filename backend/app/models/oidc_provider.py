"""OIDC Provider model for SSO/OpenID Connect integration.

Each row represents a configured identity provider (Google, Microsoft Entra ID,
Keycloak, Okta, Auth0, etc.). Supports OIDC Discovery so the admin only needs
to supply the discovery URL + client credentials — endpoints are auto-discovered.

Multiple providers can be enabled simultaneously.
"""

from sqlalchemy import String, Boolean, DateTime, Integer, Text
from sqlalchemy.orm import mapped_column, Mapped
import uuid
from datetime import datetime
from app.database import Base


class OIDCProvider(Base):
    """Configured OIDC identity provider."""

    __tablename__ = "oidc_providers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # OIDC Configuration
    discovery_url: Mapped[str] = mapped_column(String(500), nullable=False)
    client_id: Mapped[str] = mapped_column(String(500), nullable=False)
    client_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[str] = mapped_column(String(500), nullable=False, default="openid email profile")

    # Provider-specific endpoint overrides (nullable — use discovery if null)
    authorize_url_override: Mapped[str | None] = mapped_column(String(500), nullable=True)
    token_url_override: Mapped[str | None] = mapped_column(String(500), nullable=True)
    userinfo_url_override: Mapped[str | None] = mapped_column(String(500), nullable=True)
    jwks_uri_override: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Behavior
    auto_provision: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_role: Mapped[str] = mapped_column(String(50), default="user", nullable=False)
    allowed_domains: Mapped[str | None] = mapped_column(Text, nullable=True)
    require_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Claim Mapping
    email_claim: Mapped[str] = mapped_column(String(100), default="email", nullable=False)
    name_claim: Mapped[str] = mapped_column(String(100), default="name", nullable=False)
    role_claim: Mapped[str | None] = mapped_column(String(100), nullable=True)
    role_mapping: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON

    # State
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<OIDCProvider(slug={self.slug}, display_name={self.display_name}, enabled={self.is_enabled})>"

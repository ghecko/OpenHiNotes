"""Pydantic schemas for OIDC provider management and SSO flows."""

from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional
import uuid
import re
from datetime import datetime


# ---------------------------------------------------------------------------
# Public (login page)
# ---------------------------------------------------------------------------

class OIDCProviderInfo(BaseModel):
    """Minimal provider info shown on the login page."""
    slug: str
    display_name: str
    icon: Optional[str] = None


class OIDCAuthorizeResponse(BaseModel):
    """Returned when frontend requests an OIDC authorization URL."""
    authorize_url: str
    state: str


class OIDCCallbackError(BaseModel):
    """Error response from the OIDC callback."""
    error: str
    error_description: Optional[str] = None


# ---------------------------------------------------------------------------
# Admin CRUD
# ---------------------------------------------------------------------------

class OIDCProviderCreate(BaseModel):
    """Schema for creating a new OIDC provider."""
    slug: Optional[str] = None  # Auto-generated from display_name if not provided
    display_name: str
    icon: Optional[str] = None
    discovery_url: str
    client_id: str
    client_secret: str  # Plain text — encrypted before storage
    scopes: str = "openid email profile"

    # Endpoint overrides
    authorize_url_override: Optional[str] = None
    token_url_override: Optional[str] = None
    userinfo_url_override: Optional[str] = None
    jwks_uri_override: Optional[str] = None

    # Behavior
    auto_provision: bool = True
    default_role: str = "user"
    allowed_domains: Optional[str] = None
    require_approval: bool = False

    # Claim mapping
    email_claim: str = "email"
    name_claim: str = "name"
    role_claim: Optional[str] = None
    role_mapping: Optional[str] = None  # JSON string

    is_enabled: bool = True
    sort_order: int = 0

    @field_validator("slug", mode="before")
    @classmethod
    def generate_slug(cls, v, info):
        if v:
            return re.sub(r"[^a-z0-9-]", "-", v.lower().strip()).strip("-")
        return None  # Will be generated from display_name in the service


class OIDCProviderUpdate(BaseModel):
    """Schema for updating an OIDC provider. All fields optional."""
    display_name: Optional[str] = None
    icon: Optional[str] = None
    discovery_url: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None  # Plain text if provided
    scopes: Optional[str] = None

    authorize_url_override: Optional[str] = None
    token_url_override: Optional[str] = None
    userinfo_url_override: Optional[str] = None
    jwks_uri_override: Optional[str] = None

    auto_provision: Optional[bool] = None
    default_role: Optional[str] = None
    allowed_domains: Optional[str] = None
    require_approval: Optional[bool] = None

    email_claim: Optional[str] = None
    name_claim: Optional[str] = None
    role_claim: Optional[str] = None
    role_mapping: Optional[str] = None

    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class OIDCProviderResponse(BaseModel):
    """Full provider info for admin panel (client_secret masked)."""
    id: uuid.UUID
    slug: str
    display_name: str
    icon: Optional[str] = None
    discovery_url: str
    client_id: str
    client_secret_masked: str  # e.g. "****...abcd"
    scopes: str

    authorize_url_override: Optional[str] = None
    token_url_override: Optional[str] = None
    userinfo_url_override: Optional[str] = None
    jwks_uri_override: Optional[str] = None

    auto_provision: bool
    default_role: str
    allowed_domains: Optional[str] = None
    require_approval: bool

    email_claim: str
    name_claim: str
    role_claim: Optional[str] = None
    role_mapping: Optional[str] = None

    is_enabled: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OIDCDiscoveryTestResponse(BaseModel):
    """Result of testing a provider's discovery URL."""
    success: bool
    issuer: Optional[str] = None
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    jwks_uri: Optional[str] = None
    scopes_supported: Optional[list[str]] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# User Identity (admin view)
# ---------------------------------------------------------------------------

class UserIdentityResponse(BaseModel):
    """User identity info for admin."""
    id: uuid.UUID
    provider_slug: str
    provider_name: str
    subject: str
    email: Optional[str] = None
    last_login: datetime
    created_at: datetime

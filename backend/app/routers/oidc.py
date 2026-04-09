"""OIDC / SSO routes.

Public endpoints (no auth):
  GET  /auth/oidc/providers              — list enabled providers for login page
  GET  /auth/oidc/{slug}/authorize       — build OIDC authorization URL
  GET  /auth/oidc/{slug}/callback        — handle provider callback, issue JWT

Admin endpoints (require_admin):
  GET    /settings/oidc/providers        — list all providers (incl. disabled)
  POST   /settings/oidc/providers        — create provider
  GET    /settings/oidc/providers/{id}   — get provider detail
  PUT    /settings/oidc/providers/{id}   — update provider
  DELETE /settings/oidc/providers/{id}   — delete provider
  POST   /settings/oidc/test-discovery   — test a discovery URL
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import require_admin
from app.models.oidc_provider import OIDCProvider
from app.models.user import User, UserStatus
from app.models.user_identity import UserIdentity
from app.schemas.oidc import (
    OIDCProviderInfo,
    OIDCAuthorizeResponse,
    OIDCProviderCreate,
    OIDCProviderUpdate,
    OIDCProviderResponse,
    OIDCDiscoveryTestResponse,
)
from app.services.auth import AuthService
from app.services.oidc import (
    OIDCService,
    encrypt_client_secret,
    mask_client_secret,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public router (/auth/oidc)
# ---------------------------------------------------------------------------
public_router = APIRouter(prefix="/auth/oidc", tags=["oidc"])


@public_router.get("/providers", response_model=list[OIDCProviderInfo])
async def list_public_providers(db: AsyncSession = Depends(get_db)):
    """Return enabled OIDC providers for the login page."""
    providers = await OIDCService.list_enabled_providers(db)
    return [
        OIDCProviderInfo(
            slug=p.slug,
            display_name=p.display_name,
            icon=p.icon,
        )
        for p in providers
    ]


@public_router.get("/{slug}/authorize", response_model=OIDCAuthorizeResponse)
async def authorize(
    slug: str,
    redirect_uri: str = Query(..., description="The callback URL the provider should redirect to"),
    db: AsyncSession = Depends(get_db),
):
    """Build the OIDC authorization URL with PKCE for the given provider."""
    try:
        authorize_url, state = await OIDCService.build_authorize_url(db, slug, redirect_uri)
        return OIDCAuthorizeResponse(authorize_url=authorize_url, state=state)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"OIDC authorize error for {slug}: {e}")
        raise HTTPException(status_code=500, detail="Failed to build authorization URL")


@public_router.get("/{slug}/callback")
async def callback(
    slug: str,
    code: str = Query(None),
    state: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle the OIDC provider callback.

    Exchanges the authorization code for tokens, validates the ID token,
    creates/links the user, issues an internal JWT, and redirects the
    frontend with the token.
    """
    # Handle provider-side errors
    if error:
        logger.warning(f"OIDC callback error from {slug}: {error} — {error_description}")
        return RedirectResponse(
            url=f"/login?sso_error={error}&sso_error_description={error_description or ''}"
        )

    if not code or not state:
        return RedirectResponse(url="/login?sso_error=missing_params")

    try:
        # Exchange code for validated claims
        claims = await OIDCService.exchange_code(db, slug, code, state)

        # Get provider for user provisioning
        provider = await OIDCService.get_provider(db, slug)
        if not provider:
            return RedirectResponse(url="/login?sso_error=provider_not_found")

        # Find or create user
        user, is_new = await OIDCService.find_or_create_user(db, provider, claims)

        # Check user status
        if not user.is_active:
            if user.status == UserStatus.pending:
                return RedirectResponse(
                    url="/login?sso_error=account_pending&sso_error_description=Your+account+is+pending+admin+approval"
                )
            return RedirectResponse(
                url="/login?sso_error=account_inactive&sso_error_description=Your+account+has+been+deactivated"
            )

        # Issue internal JWT
        token = AuthService.create_access_token(user.id, user.email, user.role.value)

        # Redirect to frontend with token
        return RedirectResponse(url=f"/login?sso_token={token}")

    except ValueError as e:
        logger.warning(f"OIDC callback rejected for {slug}: {e}")
        from urllib.parse import quote
        return RedirectResponse(url=f"/login?sso_error=auth_failed&sso_error_description={quote(str(e))}")
    except Exception as e:
        logger.error(f"OIDC callback error for {slug}: {e}", exc_info=True)
        return RedirectResponse(url="/login?sso_error=internal_error")


# ---------------------------------------------------------------------------
# Admin router (/settings/oidc)
# ---------------------------------------------------------------------------
admin_router = APIRouter(prefix="/settings/oidc", tags=["oidc-admin"])


def _provider_to_response(provider: OIDCProvider) -> OIDCProviderResponse:
    """Convert an OIDCProvider model to the response schema (mask secret)."""
    return OIDCProviderResponse(
        id=provider.id,
        slug=provider.slug,
        display_name=provider.display_name,
        icon=provider.icon,
        discovery_url=provider.discovery_url,
        client_id=provider.client_id,
        client_secret_masked=mask_client_secret(provider.client_secret_encrypted),
        scopes=provider.scopes,
        authorize_url_override=provider.authorize_url_override,
        token_url_override=provider.token_url_override,
        userinfo_url_override=provider.userinfo_url_override,
        jwks_uri_override=provider.jwks_uri_override,
        auto_provision=provider.auto_provision,
        default_role=provider.default_role,
        allowed_domains=provider.allowed_domains,
        require_approval=provider.require_approval,
        email_claim=provider.email_claim,
        name_claim=provider.name_claim,
        role_claim=provider.role_claim,
        role_mapping=provider.role_mapping,
        is_enabled=provider.is_enabled,
        sort_order=provider.sort_order,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@admin_router.get("/providers", response_model=list[OIDCProviderResponse])
async def list_all_providers(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all OIDC providers (admin)."""
    providers = await OIDCService.list_all_providers(db)
    return [_provider_to_response(p) for p in providers]


@admin_router.post("/providers", response_model=OIDCProviderResponse, status_code=201)
async def create_provider(
    data: OIDCProviderCreate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new OIDC provider."""
    # Generate slug if not provided
    slug = data.slug or OIDCService.generate_slug(data.display_name)

    # Ensure slug uniqueness
    if await OIDCService.slug_exists(db, slug):
        # Append a short random suffix
        import secrets
        slug = f"{slug}-{secrets.token_hex(2)}"

    # Encrypt client secret
    encrypted_secret = encrypt_client_secret(data.client_secret)

    provider = OIDCProvider(
        slug=slug,
        display_name=data.display_name,
        icon=data.icon,
        discovery_url=data.discovery_url,
        client_id=data.client_id,
        client_secret_encrypted=encrypted_secret,
        scopes=data.scopes,
        authorize_url_override=data.authorize_url_override,
        token_url_override=data.token_url_override,
        userinfo_url_override=data.userinfo_url_override,
        jwks_uri_override=data.jwks_uri_override,
        auto_provision=data.auto_provision,
        default_role=data.default_role,
        allowed_domains=data.allowed_domains,
        require_approval=data.require_approval,
        email_claim=data.email_claim,
        name_claim=data.name_claim,
        role_claim=data.role_claim,
        role_mapping=data.role_mapping,
        is_enabled=data.is_enabled,
        sort_order=data.sort_order,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)

    logger.info(f"Created OIDC provider: {provider.slug} ({provider.display_name})")
    return _provider_to_response(provider)


@admin_router.get("/providers/{provider_id}", response_model=OIDCProviderResponse)
async def get_provider(
    provider_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single OIDC provider by ID."""
    provider = await OIDCService.get_provider_by_id(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return _provider_to_response(provider)


@admin_router.put("/providers/{provider_id}", response_model=OIDCProviderResponse)
async def update_provider(
    provider_id: uuid.UUID,
    data: OIDCProviderUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update an OIDC provider."""
    provider = await OIDCService.get_provider_by_id(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    update_data = data.model_dump(exclude_unset=True)

    # Handle client_secret separately (encrypt if provided)
    if "client_secret" in update_data:
        plain_secret = update_data.pop("client_secret")
        if plain_secret:
            provider.client_secret_encrypted = encrypt_client_secret(plain_secret)

    # Apply remaining updates
    for field, value in update_data.items():
        setattr(provider, field, value)

    await db.commit()
    await db.refresh(provider)

    logger.info(f"Updated OIDC provider: {provider.slug}")
    return _provider_to_response(provider)


@admin_router.delete("/providers/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: uuid.UUID,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete an OIDC provider and all associated identities."""
    provider = await OIDCService.get_provider_by_id(db, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # UserIdentity rows cascade-delete via FK
    await db.delete(provider)
    await db.commit()

    logger.info(f"Deleted OIDC provider: {provider.slug}")


@admin_router.post("/test-discovery", response_model=OIDCDiscoveryTestResponse)
async def test_discovery(
    discovery_url: str = Query(..., description="The OIDC discovery URL to test"),
    _admin: User = Depends(require_admin),
):
    """Test an OIDC discovery URL and return the discovered endpoints."""
    try:
        doc = await OIDCService.test_discovery(discovery_url)
        return OIDCDiscoveryTestResponse(
            success=True,
            issuer=doc.get("issuer"),
            authorization_endpoint=doc.get("authorization_endpoint"),
            token_endpoint=doc.get("token_endpoint"),
            userinfo_endpoint=doc.get("userinfo_endpoint"),
            jwks_uri=doc.get("jwks_uri"),
            scopes_supported=doc.get("scopes_supported"),
        )
    except Exception as e:
        return OIDCDiscoveryTestResponse(
            success=False,
            error=str(e),
        )

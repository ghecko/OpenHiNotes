"""OIDC service for SSO authentication flows.

Handles:
- OIDC Discovery document fetching and caching
- Authorization URL construction with PKCE
- Authorization code exchange for tokens
- ID token validation via JWKS
- User provisioning and account linking
- Client secret encryption/decryption
"""

import hashlib
import json
import logging
import os
import re
import secrets
import time
import uuid
from base64 import urlsafe_b64encode, urlsafe_b64decode
from datetime import datetime
from typing import Optional, Tuple

import httpx
from authlib.jose import jwt as authlib_jwt, JsonWebKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.oidc_provider import OIDCProvider
from app.models.user import User, UserRole, UserStatus, RegistrationSource
from app.models.user_identity import UserIdentity

logger = logging.getLogger(__name__)

# In-memory caches
_discovery_cache: dict[str, Tuple[dict, float]] = {}  # slug → (doc, expiry_ts)
_jwks_cache: dict[str, Tuple[dict, float]] = {}  # jwks_uri → (keyset, expiry_ts)
_pkce_store: dict[str, Tuple[dict, float]] = {}  # state → (data, expiry_ts)

DISCOVERY_TTL = 3600  # 1 hour
JWKS_TTL = 3600
PKCE_TTL = 600  # 10 minutes


# ---------------------------------------------------------------------------
# Client Secret Encryption (AES-256-GCM, same key derivation as voice profiles)
# ---------------------------------------------------------------------------

def _get_oidc_encryption_key() -> bytes:
    """Derive a 256-bit AES key for encrypting OIDC client secrets.

    Uses OIDC_ENCRYPTION_KEY if set (recommended for production),
    otherwise falls back to a derivation from SECRET_KEY so the
    feature works out of the box in development.

    In production, set OIDC_ENCRYPTION_KEY to a 64-char hex string:
        python -c "import os; print(os.urandom(32).hex())"
    """
    raw_key = settings.oidc_encryption_key
    if raw_key:
        # If it looks like a 64-char hex string, decode directly
        if len(raw_key) == 64:
            try:
                return bytes.fromhex(raw_key)
            except ValueError:
                pass
        # Otherwise, hash the passphrase
        return hashlib.sha256(raw_key.encode()).digest()

    # Fallback: derive from the app's SECRET_KEY
    return hashlib.sha256(f"oidc-client-secret-{settings.secret_key}".encode()).digest()


def encrypt_client_secret(plain_secret: str) -> str:
    """Encrypt a client secret. Returns a base64-encoded string containing nonce + ciphertext + tag."""
    key = _get_oidc_encryption_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct_with_tag = aesgcm.encrypt(nonce, plain_secret.encode("utf-8"), None)
    # Encode as: base64(nonce + ciphertext_with_tag)
    return urlsafe_b64encode(nonce + ct_with_tag).decode("ascii")


def decrypt_client_secret(encrypted: str) -> str:
    """Decrypt a client secret from its base64-encoded storage form."""
    key = _get_oidc_encryption_key()
    aesgcm = AESGCM(key)
    raw = urlsafe_b64decode(encrypted)
    nonce = raw[:12]
    ct_with_tag = raw[12:]
    plaintext = aesgcm.decrypt(nonce, ct_with_tag, None)
    return plaintext.decode("utf-8")


def mask_client_secret(encrypted: str) -> str:
    """Return a masked version for display (last 4 chars of decrypted value)."""
    try:
        plain = decrypt_client_secret(encrypted)
        if len(plain) <= 4:
            return "****"
        return f"****...{plain[-4:]}"
    except Exception:
        return "****"


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------

def generate_pkce() -> Tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256 method)."""
    code_verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return code_verifier, code_challenge


def store_pkce_state(state: str, data: dict) -> None:
    """Store PKCE data keyed by state parameter."""
    _pkce_store[state] = (data, time.time() + PKCE_TTL)
    _cleanup_expired(_pkce_store)


def retrieve_pkce_state(state: str) -> Optional[dict]:
    """Retrieve and consume PKCE data for a given state."""
    entry = _pkce_store.pop(state, None)
    if entry is None:
        return None
    data, expiry = entry
    if time.time() > expiry:
        return None
    return data


def _cleanup_expired(cache: dict) -> None:
    """Remove expired entries from an in-memory cache."""
    now = time.time()
    expired = [k for k, (_, exp) in cache.items() if now > exp]
    for k in expired:
        cache.pop(k, None)


# ---------------------------------------------------------------------------
# OIDC Discovery
# ---------------------------------------------------------------------------

class OIDCService:
    """Handles all OIDC protocol operations."""

    @staticmethod
    async def get_provider(db: AsyncSession, slug: str) -> Optional[OIDCProvider]:
        """Fetch an enabled provider by slug."""
        result = await db.execute(
            select(OIDCProvider).where(
                OIDCProvider.slug == slug,
                OIDCProvider.is_enabled == True,
            )
        )
        return result.scalars().first()

    @staticmethod
    async def get_provider_by_id(db: AsyncSession, provider_id: uuid.UUID) -> Optional[OIDCProvider]:
        """Fetch provider by ID (admin, includes disabled)."""
        result = await db.execute(
            select(OIDCProvider).where(OIDCProvider.id == provider_id)
        )
        return result.scalars().first()

    @staticmethod
    async def list_enabled_providers(db: AsyncSession) -> list[OIDCProvider]:
        """List all enabled providers, ordered by sort_order."""
        result = await db.execute(
            select(OIDCProvider)
            .where(OIDCProvider.is_enabled == True)
            .order_by(OIDCProvider.sort_order, OIDCProvider.display_name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def list_all_providers(db: AsyncSession) -> list[OIDCProvider]:
        """List all providers (admin)."""
        result = await db.execute(
            select(OIDCProvider).order_by(OIDCProvider.sort_order, OIDCProvider.display_name)
        )
        return list(result.scalars().all())

    @staticmethod
    async def discover(provider: OIDCProvider) -> dict:
        """Fetch and cache the OIDC discovery document."""
        cached = _discovery_cache.get(provider.slug)
        if cached:
            doc, expiry = cached
            if time.time() < expiry:
                return doc

        async with httpx.AsyncClient(verify=settings.get_ssl_verify(settings.llm_verify_ssl)) as client:
            url = provider.discovery_url
            if not url.endswith("/.well-known/openid-configuration"):
                # Some admins might provide the issuer URL, not the full discovery URL
                url = url.rstrip("/") + "/.well-known/openid-configuration"

            resp = await client.get(url, timeout=15.0)
            resp.raise_for_status()
            doc = resp.json()

        _discovery_cache[provider.slug] = (doc, time.time() + DISCOVERY_TTL)
        return doc

    @staticmethod
    async def test_discovery(discovery_url: str) -> dict:
        """Test a discovery URL without storing anything. Returns the document or error."""
        url = discovery_url
        if not url.endswith("/.well-known/openid-configuration"):
            url = url.rstrip("/") + "/.well-known/openid-configuration"

        async with httpx.AsyncClient(verify=settings.get_ssl_verify(settings.llm_verify_ssl)) as client:
            resp = await client.get(url, timeout=15.0)
            resp.raise_for_status()
            return resp.json()

    @staticmethod
    async def _get_jwks(jwks_uri: str) -> dict:
        """Fetch and cache the JWKS from a provider."""
        cached = _jwks_cache.get(jwks_uri)
        if cached:
            keyset, expiry = cached
            if time.time() < expiry:
                return keyset

        async with httpx.AsyncClient(verify=settings.get_ssl_verify(settings.llm_verify_ssl)) as client:
            resp = await client.get(jwks_uri, timeout=15.0)
            resp.raise_for_status()
            keyset = resp.json()

        _jwks_cache[jwks_uri] = (keyset, time.time() + JWKS_TTL)
        return keyset

    # ------------------------------------------------------------------
    # Authorization URL
    # ------------------------------------------------------------------

    @staticmethod
    async def build_authorize_url(
        db: AsyncSession,
        provider_slug: str,
        redirect_uri: str,
    ) -> Tuple[str, str]:
        """Build the OIDC authorization URL with PKCE.

        Returns (authorize_url, state).
        The code_verifier is stored internally keyed by state.
        """
        provider = await OIDCService.get_provider(db, provider_slug)
        if not provider:
            raise ValueError(f"OIDC provider '{provider_slug}' not found or disabled")

        discovery = await OIDCService.discover(provider)
        authorize_endpoint = provider.authorize_url_override or discovery["authorization_endpoint"]

        state = secrets.token_urlsafe(32)
        code_verifier, code_challenge = generate_pkce()

        # Store PKCE data
        store_pkce_state(state, {
            "code_verifier": code_verifier,
            "provider_slug": provider_slug,
            "redirect_uri": redirect_uri,
        })

        # Build URL
        params = {
            "response_type": "code",
            "client_id": provider.client_id,
            "redirect_uri": redirect_uri,
            "scope": provider.scopes,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }

        # Build query string
        from urllib.parse import urlencode
        authorize_url = f"{authorize_endpoint}?{urlencode(params)}"

        return authorize_url, state

    # ------------------------------------------------------------------
    # Code Exchange + Token Validation
    # ------------------------------------------------------------------

    @staticmethod
    async def exchange_code(
        db: AsyncSession,
        provider_slug: str,
        code: str,
        state: str,
    ) -> dict:
        """Exchange authorization code for tokens using stored PKCE data.

        Returns validated ID token claims.
        """
        # Retrieve PKCE state
        pkce_data = retrieve_pkce_state(state)
        if not pkce_data:
            raise ValueError("Invalid or expired state parameter")

        if pkce_data["provider_slug"] != provider_slug:
            raise ValueError("Provider mismatch in state")

        provider = await OIDCService.get_provider(db, provider_slug)
        if not provider:
            raise ValueError(f"OIDC provider '{provider_slug}' not found or disabled")

        discovery = await OIDCService.discover(provider)
        token_endpoint = provider.token_url_override or discovery["token_endpoint"]

        client_secret = decrypt_client_secret(provider.client_secret_encrypted)

        # Exchange code for tokens
        async with httpx.AsyncClient(verify=settings.get_ssl_verify(settings.llm_verify_ssl)) as client:
            token_data = {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": pkce_data["redirect_uri"],
                "client_id": provider.client_id,
                "client_secret": client_secret,
                "code_verifier": pkce_data["code_verifier"],
            }
            resp = await client.post(token_endpoint, data=token_data, timeout=15.0)
            resp.raise_for_status()
            tokens = resp.json()

        if "id_token" not in tokens:
            raise ValueError("Provider did not return an id_token")

        # Validate ID token
        claims = await OIDCService.validate_id_token(provider, tokens["id_token"], discovery)

        # Optionally enrich with userinfo
        if "email" not in claims or not claims.get("email"):
            userinfo_endpoint = provider.userinfo_url_override or discovery.get("userinfo_endpoint")
            if userinfo_endpoint and "access_token" in tokens:
                async with httpx.AsyncClient(verify=settings.get_ssl_verify(settings.llm_verify_ssl)) as client:
                    resp = await client.get(
                        userinfo_endpoint,
                        headers={"Authorization": f"Bearer {tokens['access_token']}"},
                        timeout=15.0,
                    )
                    if resp.status_code == 200:
                        userinfo = resp.json()
                        claims.update(userinfo)

        return claims

    @staticmethod
    async def validate_id_token(
        provider: OIDCProvider,
        id_token: str,
        discovery: dict,
    ) -> dict:
        """Validate an ID token using the provider's JWKS.

        Checks: signature, issuer, audience, expiry.
        Returns decoded claims dict.
        """
        jwks_uri = provider.jwks_uri_override or discovery["jwks_uri"]
        jwks_data = await OIDCService._get_jwks(jwks_uri)

        # Reject unsigned tokens (alg: none) before attempting decode.
        # authlib also rejects these when a keyset is provided, but we
        # add an explicit check for defense in depth.
        import json as _json
        from base64 import urlsafe_b64decode as _b64d
        try:
            header_b64 = id_token.split(".")[0]
            header_b64 += "=" * (-len(header_b64) % 4)  # pad
            header = _json.loads(_b64d(header_b64))
            if header.get("alg", "").lower() == "none":
                raise ValueError("ID token uses alg=none — rejected")
        except (IndexError, _json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("Malformed ID token header")

        # Use authlib to decode and validate signature via JWKS
        keyset = JsonWebKey.import_key_set(jwks_data)

        claims = authlib_jwt.decode(
            id_token,
            keyset,
        )

        # Manual validation
        issuer = discovery.get("issuer")
        if issuer and claims.get("iss") != issuer:
            raise ValueError(f"ID token issuer mismatch: expected {issuer}, got {claims.get('iss')}")

        if claims.get("aud"):
            aud = claims["aud"]
            valid_aud = aud == provider.client_id or (isinstance(aud, list) and provider.client_id in aud)
            if not valid_aud:
                raise ValueError(f"ID token audience mismatch: expected {provider.client_id}")

        if claims.get("exp") and claims["exp"] < time.time():
            raise ValueError("ID token has expired")

        return dict(claims)

    # ------------------------------------------------------------------
    # User Provisioning & Account Linking
    # ------------------------------------------------------------------

    @staticmethod
    async def find_or_create_user(
        db: AsyncSession,
        provider: OIDCProvider,
        claims: dict,
    ) -> Tuple[User, bool]:
        """Find an existing user or create a new one based on OIDC claims.

        Account linking strategy:
        1. Check user_identities for (provider_id, subject) → return linked user
        2. Check users by email (only if email_verified) → link identity and return
        3. Auto-provision if enabled → create new user + identity
        4. Otherwise raise

        Returns (user, is_new_user).
        """
        subject = claims.get("sub")
        if not subject:
            raise ValueError("ID token missing 'sub' claim")

        email = claims.get(provider.email_claim, claims.get("email"))
        display_name = claims.get(provider.name_claim, claims.get("name"))
        email_verified = claims.get("email_verified", False)

        # 1. Check for existing identity link
        result = await db.execute(
            select(UserIdentity).where(
                UserIdentity.provider_id == provider.id,
                UserIdentity.subject == subject,
            )
        )
        identity = result.scalars().first()

        if identity:
            # Update last login
            identity.last_login = datetime.utcnow()
            identity.email = email
            identity.raw_claims = json.dumps(claims)
            await db.commit()

            # Fetch user
            user_result = await db.execute(select(User).where(User.id == identity.user_id))
            user = user_result.scalars().first()
            if not user:
                raise ValueError("Linked user no longer exists")
            return user, False

        # 2. Try to match by email (only if email_verified from provider)
        if email and email_verified:
            result = await db.execute(select(User).where(User.email == email))
            existing_user = result.scalars().first()

            if existing_user:
                # Link this identity to the existing user
                identity = UserIdentity(
                    user_id=existing_user.id,
                    provider_id=provider.id,
                    subject=subject,
                    email=email,
                    raw_claims=json.dumps(claims),
                    last_login=datetime.utcnow(),
                )
                db.add(identity)
                await db.commit()
                return existing_user, False

        # 3. Check domain restriction
        if provider.allowed_domains and email:
            allowed = [d.strip().lower() for d in provider.allowed_domains.split(",") if d.strip()]
            if allowed:
                domain = email.split("@")[-1].lower()
                if domain not in allowed:
                    raise ValueError(
                        f"Email domain '{domain}' is not allowed for this provider"
                    )

        # 4. Auto-provision new user
        if not provider.auto_provision:
            raise ValueError(
                "Auto-provisioning is disabled for this provider. Contact your administrator."
            )

        if not email:
            raise ValueError("Cannot create account: no email in OIDC claims")

        # Determine role
        role = UserRole.user
        if provider.default_role == "admin":
            role = UserRole.admin

        # Check role mapping from claims
        if provider.role_claim and provider.role_mapping:
            provider_role_value = claims.get(provider.role_claim)
            if provider_role_value:
                try:
                    mapping = json.loads(provider.role_mapping)
                    mapped_role = mapping.get(str(provider_role_value))
                    if mapped_role == "admin":
                        role = UserRole.admin
                except (json.JSONDecodeError, TypeError):
                    pass

        # Determine status
        status = UserStatus.pending if provider.require_approval else UserStatus.active

        # Create user (OIDC users get a random password hash — they can't use password login)
        random_pw_hash = f"$oidc$no-password-login${secrets.token_hex(32)}"

        user = User(
            email=email,
            hashed_password=random_pw_hash,
            display_name=display_name,
            role=role,
            status=status,
            registration_source=RegistrationSource.oidc,
            is_active=(status == UserStatus.active),
        )
        db.add(user)
        await db.flush()  # Get the user ID

        # Create identity link
        identity = UserIdentity(
            user_id=user.id,
            provider_id=provider.id,
            subject=subject,
            email=email,
            raw_claims=json.dumps(claims),
            last_login=datetime.utcnow(),
        )
        db.add(identity)
        await db.commit()
        await db.refresh(user)

        logger.info(
            f"OIDC: provisioned new user {email} via provider {provider.slug} "
            f"(status={status.value}, role={role.value})"
        )

        return user, True

    # ------------------------------------------------------------------
    # Admin helpers
    # ------------------------------------------------------------------

    @staticmethod
    def generate_slug(display_name: str) -> str:
        """Generate a URL-safe slug from a display name."""
        slug = re.sub(r"[^a-z0-9]+", "-", display_name.lower().strip()).strip("-")
        return slug or "provider"

    @staticmethod
    async def slug_exists(db: AsyncSession, slug: str, exclude_id: Optional[uuid.UUID] = None) -> bool:
        """Check if a slug is already in use."""
        query = select(OIDCProvider).where(OIDCProvider.slug == slug)
        if exclude_id:
            query = query.where(OIDCProvider.id != exclude_id)
        result = await db.execute(query)
        return result.scalars().first() is not None

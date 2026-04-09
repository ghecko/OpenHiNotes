# SSO / OpenID Connect — Setup Guide

## Overview

OpenHiNotes supports Single Sign-On (SSO) via any standards-compliant OpenID Connect (OIDC) provider. Users can sign in with their existing corporate or personal identity instead of a local password.

Supported providers include (non-exhaustive): Google Workspace, Microsoft Entra ID (Azure AD), Keycloak, Okta, Auth0, Authentik, Zitadel, GitLab, and any provider that publishes an OIDC Discovery document.

Multiple providers can be active simultaneously.

---

## How It Works

```
User clicks "Continue with Google"
     |
     v
Browser → OpenHiNotes backend → builds OIDC authorize URL (with PKCE)
     |
     v
Browser redirects to provider login page
     |
     v
User authenticates at provider
     |
     v
Provider redirects back to OpenHiNotes callback URL
     |
     v
Backend exchanges code for tokens, validates ID token via JWKS
     |
     v
Backend creates or links user account, issues internal JWT
     |
     v
User is logged in
```

The entire flow is backend-driven: the `client_secret` never leaves the server, and provider-specific quirks are handled in one place.

---

## Prerequisites

1. **A running OpenHiNotes instance** accessible via HTTPS (required by most providers for redirect URIs).
2. **An OIDC client** registered with your identity provider (you'll need the Client ID, Client Secret, and Discovery URL).
3. **Admin access** to OpenHiNotes.

---

## Step 1: Environment Configuration

Add the following to your `.env` file (optional but recommended for production):

```env
# Encryption key for OIDC client secrets at rest (AES-256-GCM).
# Generate with: python -c "import os; print(os.urandom(32).hex())"
# If empty, a key is derived from SECRET_KEY (fine for dev, set explicitly in prod).
OIDC_ENCRYPTION_KEY=
```

If you leave `OIDC_ENCRYPTION_KEY` empty, a key is automatically derived from your `SECRET_KEY`. This is fine for development but in production you should set a dedicated key so that rotating `SECRET_KEY` doesn't break existing encrypted client secrets.

After changing `.env`, restart the backend container:

```bash
docker compose restart backend
```

---

## Step 2: Register an OIDC Client with Your Provider

Each provider has its own console for creating OAuth/OIDC clients. Below are the key settings you'll need to configure on the provider side:

| Setting | Value |
|---|---|
| **Application type** | Web application |
| **Redirect URI** | `https://your-domain.com/api/auth/oidc/{slug}/callback` |
| **Scopes** | `openid email profile` |

Replace `{slug}` with the URL-safe identifier you'll give this provider in OpenHiNotes (e.g., `google`, `microsoft`, `company-sso`).

After creation, note the **Client ID**, **Client Secret**, and **Discovery URL** (also called Issuer URL).

### Provider-Specific Discovery URLs

| Provider | Discovery URL |
|---|---|
| Google | `https://accounts.google.com/.well-known/openid-configuration` |
| Microsoft Entra ID | `https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration` |
| Keycloak | `https://{host}/realms/{realm}/.well-known/openid-configuration` |
| Okta | `https://{domain}/oauth2/default/.well-known/openid-configuration` |
| Auth0 | `https://{domain}/.well-known/openid-configuration` |
| Authentik | `https://{host}/application/o/{app-slug}/.well-known/openid-configuration` |
| GitLab | `https://gitlab.com/.well-known/openid-configuration` |

You can also provide just the issuer URL (e.g., `https://accounts.google.com`) — OpenHiNotes will automatically append `/.well-known/openid-configuration`.

---

## Step 3: Add the Provider in OpenHiNotes

1. Log in as admin.
2. Go to **Administration → SSO / OIDC** tab.
3. Click **Add Provider**.
4. Fill in:
   - **Display Name**: what users see on the login button (e.g., "Google", "Company SSO")
   - **Discovery URL**: from the table above
   - **Client ID** and **Client Secret**: from your provider's console
   - **Scopes**: usually `openid email profile` (the default)
5. Click **Test** next to the Discovery URL to verify it resolves correctly. You should see the issuer, endpoints, and supported scopes.
6. Configure behavior:
   - **Auto-provision users**: automatically create an account on first SSO login (default: on)
   - **Require admin approval**: new SSO users start in `pending` status until approved (default: off)
   - **Default role**: `user` or `admin` for auto-provisioned accounts
   - **Allowed domains**: comma-separated list of email domains (e.g., `company.com, partner.com`). Leave empty to allow all domains.
7. Click **Create Provider**.

The SSO button will immediately appear on the login page.

---

## Step 4: Test the Flow

1. Open the login page in a private/incognito window.
2. You should see a "Continue with {Provider}" button.
3. Click it — you'll be redirected to the provider's login page.
4. After authenticating, you'll be redirected back and logged in.
5. Check the admin Users tab to verify the account was created with `registration_source: oidc`.

---

## Account Linking

When a user signs in via SSO, OpenHiNotes uses this logic:

1. **Existing identity link**: if this user has signed in with this provider before (matched by provider + subject ID), they're logged in to their existing account.
2. **Email match**: if no identity link exists but a local account has the same email **and** the provider confirms `email_verified: true`, the SSO identity is linked to the existing account. The user can then sign in either way.
3. **New account**: if no match is found and auto-provisioning is enabled, a new account is created. OIDC-only users cannot sign in with a password (they have no password set).

**Security note**: email-based linking only happens when the provider certifies the email is verified. This prevents an attacker from creating an unverified account on a third-party IDP to take over a local account.

---

## Claim Mapping

By default, OpenHiNotes reads `email` and `name` from the ID token claims. Some providers use different claim names (e.g., Microsoft may return `preferred_username` instead of `email` in certain configurations).

You can customize this per provider under **Advanced: Claim Mapping** in the provider form:

- **Email claim**: the claim containing the user's email (default: `email`)
- **Name claim**: the claim containing the user's display name (default: `name`)

---

## Managing Providers

From the **Administration → SSO / OIDC** tab you can:

- **Enable/disable** a provider without deleting it (toggle switch)
- **Edit** client credentials, scopes, behavior settings, and claim mapping
- **Delete** a provider — this also removes all linked identities (users keep their accounts but lose the SSO link)
- **Test discovery** — verify that a discovery URL is reachable and returns valid endpoints

---

## Security

### Client Secret Encryption

Client secrets are encrypted at rest using AES-256-GCM. The encryption key is derived from `OIDC_ENCRYPTION_KEY` (recommended) or falls back to `SECRET_KEY`. Secrets are never returned in API responses — the admin panel shows a masked version (e.g., `****...abcd`).

### PKCE (Proof Key for Code Exchange)

All OIDC flows use PKCE with S256 challenge method, even for confidential clients. This protects against authorization code interception attacks.

### Token Validation

ID tokens are validated server-side:

- Signature verified against the provider's JWKS (JSON Web Key Set)
- `alg: none` tokens are explicitly rejected
- Issuer (`iss`) must match the discovery document
- Audience (`aud`) must match the configured Client ID
- Token expiry (`exp`) is checked

### State Parameter (CSRF Protection)

A cryptographically random `state` parameter is generated for each authorization request, stored server-side with a 10-minute TTL, and validated on callback. This prevents CSRF login attacks.

### Domain Restrictions

Per-provider `allowed_domains` filtering happens server-side after token validation, not on the frontend. An attacker cannot bypass domain restrictions by manipulating the browser.

---

## Troubleshooting

| Symptom | Likely Cause |
|---|---|
| "Provider not found" on login | Provider is disabled or slug doesn't match the callback URL |
| "Invalid or expired state" | The user took more than 10 minutes to authenticate, or the backend restarted between authorize and callback (state is in-memory) |
| "Email domain not allowed" | The user's email domain isn't in the provider's allowed domains list |
| "Auto-provisioning is disabled" | The user has no existing account and `auto_provision` is off |
| "Account pending" after SSO | The provider has `require_approval` enabled — admin needs to approve in the Users tab |
| Discovery test fails | Check the URL is correct and the backend can reach it (firewall, DNS, SSL) |
| "ID token audience mismatch" | The Client ID in OpenHiNotes doesn't match the one registered with the provider |

### Logs

OIDC events are logged at INFO/WARNING level. Check backend logs for details:

```bash
docker compose logs backend | grep OIDC
```

---

## Limitations

- **In-memory state storage**: PKCE state is stored in-memory. If the backend restarts mid-flow, pending SSO logins will fail (users just need to click the SSO button again). For multi-instance deployments, consider adding Redis-backed state storage.
- **No SAML**: only OIDC is supported. Most SAML providers also support OIDC.
- **No front-channel logout**: signing out of OpenHiNotes doesn't sign out of the provider (and vice versa). The internal JWT expiry (24h) governs session lifetime.

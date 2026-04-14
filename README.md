# OpenHiNotes

A self-hosted web application for managing, transcribing, and summarizing audio recordings from HiDock devices. Connect your HiDock via WebUSB, transcribe recordings using [VoxHub](https://github.com/ghecko/VoxHub), rename speakers from diarization, and chat with an LLM about your transcripts.

## Features

- **WebUSB device connection** — browse, download, and manage audio files directly from HiDock H1, H1E, P1, and P1 Mini devices in the browser
- **Server-side transcription** — audio is uploaded to the FastAPI backend, which proxies to a [VoxHub](https://github.com/ghecko/VoxHub) API server (OpenAI-compatible)
- **VoxHub Job Mode** — async transcription with real-time progress streaming via SSE for long recordings
- **Speaker diarization & renaming** — color-coded speakers with inline click-to-edit renaming
- **Voice fingerprinting** — users record a voice sample; speakers are automatically identified by name during transcription (AES-256-GCM encrypted at rest)
- **Summary templates** — admins define reusable prompt templates; users generate summaries from any transcription with one click
- **LLM chat** — send any transcript as context to an OpenAI-compatible endpoint and ask questions (streaming)
- **Authentication & roles** — JWT-based auth with admin and user roles, registration controls, domain whitelisting, admin approval flow
- **SSO / OIDC** — single sign-on via any OpenID Connect provider (Google, Microsoft Entra ID, Keycloak, Okta, Auth0, etc.), multiple providers simultaneously
- **Collections & sharing** — organize transcriptions into collections, share with users or groups
- **Dark mode** — system-aware theme with manual toggle, glass-morphism UI
- **Fully dockerized** — Docker Compose with PostgreSQL, FastAPI, and Vite/Nginx — designed to sit behind an existing reverse proxy (Caddy, Nginx, Traefik, etc.) over a shared Docker network

## Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
│   Browser    │ WebUSB│   HiDock     │       │   VoxHub API     │
│  (React +    │◄─────►│   Device     │       │   Server         │
│   Vite)      │       └──────────────┘       └────────▲─────────┘
│              │                                        │
│  uploads audio via /api                               │
│              │                                        │
└──────┬───────┘                                        │
       │ HTTPS                                          │
┌──────▼───────┐       ┌──────────────┐                 │
│  Your reverse│──────►│   FastAPI    │─────────────────┘
│  proxy       │       │   Backend    │
│  (Caddy /    │       │              │───────► LLM API (chat/summaries)
│   Nginx /    │       └──────┬───────┘
│   Traefik)   │──────►┌──────▼───────┐
└──────────────┘       │  React/Nginx │
       ▲               │  Frontend    │
       │               └──────────────┘
 proxy-net                    │
 (Docker network)      ┌──────▼───────┐
                       │  PostgreSQL  │
                       └──────────────┘
```

OpenHiNotes does **not** bundle a reverse proxy. The `frontend` container joins an external Docker network (`proxy-net`) so your existing proxy can reach it by container name (`hinotes-frontend`). The `db` and `backend` containers are isolated on an internal network and are never exposed to the host.

---

## Quick Start

> **Just want to try it out?** See [docs/STANDALONE_QUICKSTART.md](docs/STANDALONE_QUICKSTART.md) for a one-command setup with a bundled self-signed Caddy — no external reverse proxy needed.

The instructions below assume you already run a reverse proxy on your server (Caddy, Nginx, Traefik, etc.) and want to integrate OpenHiNotes into it.

### Prerequisites

- Docker and Docker Compose
- A [VoxHub](https://github.com/ghecko/VoxHub) server for transcription
- A reverse proxy (Caddy, Nginx, Traefik, etc.) serving HTTPS — **required for WebUSB**
- An external Docker network named `proxy-net` that your reverse proxy already uses

> **Why a separate reverse proxy?** WebUSB requires a secure context (HTTPS). OpenHiNotes is designed to sit behind whatever proxy you already run on your server, keeping the compose file simple and avoiding bundled certificate management.

### 1. Create the shared network (once per host)

```bash
docker network create proxy-net
```

### 2. Configure and start

```bash
git clone https://github.com/ghecko/OpenHiNotes.git
cd OpenHiNotes

cp .env.example .env
# Edit .env — at minimum set VOXHUB_API_URL, LLM_API_URL, and SITE_HOST

docker compose up -d --build
```

### 3. Point your reverse proxy at the frontend

The frontend container is named `hinotes-frontend` and listens on port 80. Example Caddy block:

```caddyfile
hinotes.yourdomain.com {
    handle /api/* {
        reverse_proxy backend:8000
    }
    handle {
        reverse_proxy hinotes-frontend:80
    }
}
```

> For Nginx or Traefik, route `/api/*` to the backend container on port 8000 and everything else to `hinotes-frontend:80`.

Open your configured domain in a browser. HTTPS is required for WebUSB to function.

Default admin credentials (override in `.env` before first startup):

| Field    | Default                    |
|----------|----------------------------|
| Email    | `admin@openhinotes.local`  |
| Password | `admin`                    |

---

## Production Deployment

### 1. Prepare the server

Any Linux host with Docker and Docker Compose installed. The server must be reachable on ports 80 and 443 via your reverse proxy.

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in every variable — pay special attention to the ones marked **required**:

| Variable | Required | Description |
|---|---|---|
| `SITE_HOST` | ✅ | Your domain name or IP (e.g. `hinotes.company.com`) |
| `SECRET_KEY` | ✅ | Random string for JWT signing — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `POSTGRES_PASSWORD` | ✅ | Strong database password |
| `ADMIN_EMAIL` | ✅ | Initial admin account email |
| `ADMIN_PASSWORD` | ✅ | Initial admin password — change after first login |
| `VOXHUB_API_URL` | ✅ | URL of your VoxHub instance |
| `LLM_API_URL` | ✅ | OpenAI-compatible LLM endpoint |
| `LLM_API_KEY` | — | API key if required by your LLM |
| `LLM_MODEL` | — | Model name (default: `gpt-3.5-turbo`) |
| `VOICE_EMBEDDING_KEY` | — | AES-256 key for voice fingerprinting encryption. Generate: `python -c "import os; print(os.urandom(32).hex())"` |
| `OIDC_ENCRYPTION_KEY` | — | AES-256 key for OIDC client secret encryption. Generate: same command. Required if you use SSO. |
| `CORS_ORIGINS` | — | Allowed CORS origins (default: `*`) |

> **Security note**: `VOICE_EMBEDDING_KEY` and `OIDC_ENCRYPTION_KEY` default to a derivation of `SECRET_KEY` if left empty. Set them explicitly in production so that rotating `SECRET_KEY` doesn't break encrypted data.

### 3. Configure your reverse proxy

Point your existing proxy at the `hinotes-frontend` container (port 80) for the UI and `backend` container (port 8000) for `/api/*`. Both are reachable via the shared `proxy-net` Docker network.

Example Caddy block for production:

```caddyfile
hinotes.company.com {
    handle /api/* {
        reverse_proxy backend:8000
    }
    handle {
        reverse_proxy hinotes-frontend:80
    }
}
```

If your proxy runs outside Docker, expose the frontend port in `docker-compose.yml` and proxy to `localhost:<port>` instead.

### 4. Launch

```bash
docker compose up -d --build
```

### 5. First login

1. Open `https://your-domain` in a browser.
2. Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **Change the admin password immediately** via your profile settings.
4. Configure any remaining settings (VoxHub model, LLM, registration policy) from **Administration → API Settings**.

### 6. Optional: SSO / OIDC

If you want users to sign in with Google, Microsoft, Keycloak, or another provider:

1. Set `OIDC_ENCRYPTION_KEY` in `.env` and restart.
2. Register an OIDC client with your provider (redirect URI: `https://your-domain/api/auth/oidc/{slug}/callback`).
3. Go to **Administration → SSO / OIDC → Add Provider**.

Full setup guide: [`docs/SSO_OIDC_SETUP.md`](docs/SSO_OIDC_SETUP.md)

---

## Configuration Reference

All configuration is through environment variables. See [`.env.example`](.env.example) for defaults and comments.

| Variable | Description | Default |
|---|---|---|
| `SITE_HOST` | Domain/IP for Caddy TLS and Vite allowedHosts | `localhost` |
| `SECRET_KEY` | JWT signing key | `change-me-...` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `postgres` |
| `ADMIN_EMAIL` | Initial admin email | `admin@openhinotes.local` |
| `ADMIN_PASSWORD` | Initial admin password | `admin` |
| `VOXHUB_API_URL` | VoxHub transcription API URL | `http://voxhub:8000` |
| `VOXHUB_MODEL` | Whisper model name | `large-v3` |
| `VOXHUB_JOB_MODE` | Enable async Job Mode (`true`/`false`) | `false` |
| `VOXHUB_VAD_MODE` | VAD strategy: `silero`, `pyannote`, `hybrid`, `none` | `silero` |
| `VOXHUB_VERIFY_SSL` | SSL verification for VoxHub (`true`/`false`/path) | `true` |
| `LLM_API_URL` | OpenAI-compatible LLM endpoint | `http://host.docker.internal:11434/v1` |
| `LLM_API_KEY` | LLM API key | *(empty)* |
| `LLM_MODEL` | LLM model name | `gpt-3.5-turbo` |
| `LLM_VERIFY_SSL` | SSL verification for LLM (`true`/`false`/path) | `true` |
| `VOICE_EMBEDDING_KEY` | AES-256 key for voice embedding encryption | *(derived from SECRET_KEY)* |
| `VOICE_EMBEDDING_KEY_OLD` | Previous key during rotation only | *(empty)* |
| `SPEAKER_MATCH_THRESHOLD` | Cosine distance threshold for speaker matching | `0.5` |
| `OIDC_ENCRYPTION_KEY` | AES-256 key for OIDC client secret encryption | *(derived from SECRET_KEY)* |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |

### SSL Verification

The `*_VERIFY_SSL` settings accept:
- `"true"` — use the system CA store (default)
- `"false"` — disable verification (dev only, self-signed certs)
- A file path — use a custom CA bundle (e.g. `/etc/ssl/certs/ca-bundle.crt`)

---

## Project Structure

```
OpenHiNotes/
├── backend/                  # Python FastAPI application
│   ├── app/
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── routers/          # API route handlers
│   │   ├── services/         # Business logic (auth, OIDC, transcription, LLM)
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── config.py         # Settings from environment variables
│   │   ├── database.py       # Async SQLAlchemy setup
│   │   └── dependencies.py   # Auth dependencies
│   ├── alembic/              # Database migrations (auto-applied on startup)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # React + Vite + TypeScript application
│   ├── src/
│   │   ├── api/              # Backend API client modules
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Route pages (including admin panel)
│   │   ├── store/            # Zustand state management
│   │   └── types/            # TypeScript type definitions
│   ├── package.json
│   └── Dockerfile
├── docs/                     # Feature documentation
│   ├── SSO_OIDC_SETUP.md     # SSO/OIDC provider setup guide
│   └── VOICE_FINGERPRINTING.md
├── docker-compose.yml        # Development orchestration
├── docker-compose.prod.yml   # Production orchestration
├── Caddyfile                 # Dev reverse proxy (self-signed TLS)
├── Caddyfile.prod            # Production reverse proxy
└── .env.example              # Environment variable template
```

---

## Supported Devices

| Device         | Product IDs          |
|----------------|----------------------|
| HiDock H1      | `0xAF0C`             |
| HiDock H1E     | `0xAF0D`, `0xB00D`   |
| HiDock P1      | `0xAF0E`, `0xB00E`   |
| HiDock P1 Mini | `0xAF0F`             |

---

## Development

Run services locally without Docker:

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Set DATABASE_URL to a local PostgreSQL instance
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to `http://localhost:8000` automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS 3, Zustand, React Router 6 |
| Backend | Python 3.11, FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | JWT (python-jose), bcrypt (passlib), OIDC (authlib) |
| Encryption | AES-256-GCM (cryptography) |
| Device | WebUSB API (browser-native) |
| Transcription | [VoxHub](https://github.com/ghecko/VoxHub) (OpenAI-compatible) |
| Deployment | Docker Compose, Caddy 2 |

---

## Acknowledgments

This project is a full rewrite of [HiDock Next](https://github.com/HiDock/hidock-next), the original open-source web client for HiDock recording devices. The WebUSB protocol implementation and device communication layer are derived from that project. OpenHiNotes replaces the client-only architecture with a FastAPI backend, adds server-side transcription via [VoxHub](https://github.com/ghecko/VoxHub), authentication, SSO/OIDC, summary templates, voice fingerprinting, and LLM chat capabilities.

## License

See [LICENSE](LICENSE) for details.

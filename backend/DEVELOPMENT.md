# OpenHiNotes Backend — Development Guide

## Architecture Overview

### Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | FastAPI | 0.115+ |
| Database | PostgreSQL + SQLAlchemy 2.0 (async) | 16+ |
| Async Driver | asyncpg | 0.30+ |
| Migrations | Alembic | 1.13+ |
| Auth | JWT (python-jose) + bcrypt (passlib) | — |
| HTTP Client | httpx (async) | 0.27+ |
| Config | pydantic-settings | 2.5+ |
| Python | Python | 3.11+ |

### Project Structure

```
app/
├── main.py                 # FastAPI application, middleware, startup events
├── config.py               # Pydantic Settings configuration
├── database.py             # Async SQLAlchemy engine and session factory
├── dependencies.py         # JWT and authorization dependencies
├── models/
│   ├── user.py             # User model with roles
│   ├── transcription.py    # Transcription model with status tracking
│   ├── template.py         # SummaryTemplate model
│   ├── summary.py          # Summary model
│   └── app_settings.py     # Application settings model
├── schemas/
│   ├── user.py             # User request/response schemas
│   ├── transcription.py    # Transcription schemas
│   ├── template.py         # Template schemas
│   ├── summary.py          # Summary schemas
│   └── chat.py             # Chat request schema
├── routers/
│   ├── auth.py             # Authentication routes
│   ├── users.py            # User management (admin)
│   ├── transcriptions.py   # Transcription CRUD + VoxHub integration
│   ├── templates.py        # Template management (admin)
│   ├── summaries.py        # Summary generation
│   ├── chat.py             # Streaming chat endpoint
│   └── app_settings.py     # Application settings (admin)
└── services/
    ├── auth.py             # Password hashing, JWT operations
    ├── transcription.py    # File handling, VoxHub API calls
    ├── llm.py              # LLM API integration, streaming
    └── settings_service.py # App settings resolution
```

## Service Layer

### TranscriptionService

- Async file upload handling with user-scoped directories (`/app/uploads/{user_id}/`)
- [VoxHub](https://github.com/ghecko/VoxHub) API integration with two modes:
  - **Normal mode**: synchronous `POST /v1/audio/transcriptions`
  - **Job mode**: async submit → poll with progress callback → fetch result
- `on_progress` callback enables real-time SSE streaming to the frontend
- Segment parsing with speaker extraction
- Configurable SSL verification via `VOXHUB_VERIFY_SSL`

### LLMService

- Summary generation via OpenAI-compatible API with template substitution (`{{transcript}}`)
- Async streaming chat completions with SSE output
- Configurable SSL verification via `LLM_VERIFY_SSL`

### AuthService

- bcrypt password hashing
- JWT creation/validation with 24h expiry
- Automatic admin user creation on startup

## Configuration

All settings are loaded from environment variables via `pydantic-settings`. See the root [`.env.example`](../.env.example) for all available options.

### SSL Verification

The `LLM_VERIFY_SSL` and `VOXHUB_VERIFY_SSL` settings control outbound HTTPS verification:

| Value | Behavior |
|-------|----------|
| `"true"` | Use system CA store (default) |
| `"false"` | Disable SSL verification (dev only) |
| File path | Use a custom CA bundle (e.g. `/etc/ssl/certs/ca-certificates.crt`) |

These are applied to all `httpx.AsyncClient` instances in `llm.py` and `transcription.py`.

## SSE Streaming Endpoints

### `/api/transcriptions/upload-stream`

Streams VoxHub job progress to the frontend:

```
data: {"event": "progress", "status": "uploading", "progress": 0}
data: {"event": "progress", "status": "processing", "progress": 45.5}
data: {"event": "complete", "transcription": {...}}
```

Uses `asyncio.Queue` to bridge the `on_progress` callback to the SSE generator.

### `/api/chat`

Streams LLM chat completions:

```
data: {"content": "chunk1"}
data: {"content": "chunk2"}
data: [DONE]
```

Error events: `data: {"error": "message"}`

## Database Migrations

Alembic is configured for async migrations:

```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

## Development Workflow

### Local Setup

```bash
pip install -r requirements.txt
cp ../.env.example ../.env   # Edit with your settings
docker compose up -d db      # Start PostgreSQL
alembic upgrade head
uvicorn app.main:app --reload
```

### Docker Setup

```bash
# From the project root
docker compose up --build
```

## Security

1. **Passwords** — bcrypt hashed, never stored in plaintext
2. **JWT** — signed with `SECRET_KEY`, 24h expiry
3. **CORS** — configurable origins (defaults to `*` for development)
4. **Authorization** — role-based and resource ownership checks
5. **File storage** — user-scoped directories prevent cross-access
6. **External APIs** — httpx with timeouts and configurable SSL verification

## Performance

1. **Async throughout** — all I/O operations are non-blocking
2. **Connection pooling** — SQLAlchemy engine pool
3. **Streaming responses** — chat and transcription progress don't buffer
4. **Pagination** — skip/limit on list endpoints
5. **Database indexes** — on user_id, transcription_id, email

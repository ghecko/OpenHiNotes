# OpenHiNotes Backend

FastAPI backend for managing audio transcriptions from HiDock recording devices.

## Features

- JWT-based authentication with admin/user roles
- Audio file upload and transcription via [VoxHub](https://github.com/ghecko/VoxHub) API
- VoxHub Job Mode with SSE progress streaming for long audio files
- Transcription management (list, view, update speakers/notes, delete)
- Summary generation using OpenAI-compatible LLM API
- Chat interface with streaming responses
- Async database operations with SQLAlchemy
- Database migrations with Alembic
- Configurable SSL verification for outbound API calls

## Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, middleware, startup events
│   ├── config.py               # Settings from environment variables
│   ├── database.py             # Async SQLAlchemy setup
│   ├── dependencies.py         # JWT and authorization dependencies
│   ├── models/                 # SQLAlchemy models
│   ├── schemas/                # Pydantic request/response schemas
│   ├── routers/                # API route handlers
│   └── services/               # Business logic and external API calls
├── alembic/                    # Database migrations
└── requirements.txt            # Python dependencies
```

## Setup

### Environment Variables

Configuration is managed via the root [`.env.example`](../.env.example). Copy it to `.env` at the project root:

```bash
# From the project root
cp .env.example .env
```

Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `SECRET_KEY` — JWT signing key (change in production!)
- `VOXHUB_API_URL` — URL to [VoxHub](https://github.com/ghecko/VoxHub) transcription service
- `VOXHUB_VERIFY_SSL` — SSL verification for VoxHub calls (`true`, `false`, or CA bundle path)
- `LLM_API_URL` — OpenAI-compatible API endpoint
- `LLM_VERIFY_SSL` — SSL verification for LLM calls (`true`, `false`, or CA bundle path)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — Initial admin credentials

### Local Development

```bash
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

API available at `http://localhost:8000`, docs at `http://localhost:8000/docs`.

### Docker

```bash
# From the project root
docker compose up --build
```

## API Endpoints

### Authentication
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login and get JWT token
- `GET /api/auth/me` — Get current user info

### Users (Admin)
- `GET /api/users` — List all users
- `PATCH /api/users/{id}/role` — Update user role

### Transcriptions
- `POST /api/transcriptions/upload` — Upload audio and transcribe (synchronous)
- `POST /api/transcriptions/upload-stream` — Upload and transcribe with SSE progress streaming
- `GET /api/transcriptions` — List user's transcriptions (paginated)
- `GET /api/transcriptions/{id}` — Get transcription details
- `PATCH /api/transcriptions/{id}/speakers` — Update speaker names
- `PATCH /api/transcriptions/{id}/notes` — Add/edit notes
- `DELETE /api/transcriptions/{id}` — Delete transcription

### Templates (Admin)
- `GET /api/templates` — List active templates
- `POST /api/templates` — Create new template
- `PATCH /api/templates/{id}` — Update template
- `DELETE /api/templates/{id}` — Deactivate template

### Summaries
- `POST /api/summaries` — Generate summary from transcription
- `GET /api/summaries?transcription_id=X` — List summaries

### Chat
- `POST /api/chat` — Stream chat responses (Server-Sent Events)

### Health
- `GET /api/health` — Health check

## External API Integration

### VoxHub API

Sends audio files to [VoxHub](https://github.com/ghecko/VoxHub) for transcription. Supports two modes:

- **Normal mode** — synchronous `POST /v1/audio/transcriptions`
- **Job mode** — async `POST /v1/audio/transcriptions/jobs` → poll status → fetch result

Job mode is enabled via the `VOXHUB_JOB_MODE` app setting and provides real-time progress via SSE.

### LLM API

Uses any OpenAI-compatible API for:
- Summary generation: `POST {LLM_API_URL}/chat/completions`
- Chat responses (streaming): `POST {LLM_API_URL}/chat/completions` with `stream: true`

## Database Models

| Model | Key Fields |
|-------|-----------|
| **User** | id, email, hashed_password, role (admin/user), display_name |
| **Transcription** | id, user_id, filename, text, segments (JSON), speakers (JSON), status, notes |
| **SummaryTemplate** | id, name, prompt_template (with `{{transcript}}`), is_active |
| **Summary** | id, transcription_id, template_id, content, model_used |

## Database Migrations

```bash
alembic revision --autogenerate -m "description"  # Create migration
alembic upgrade head                               # Apply migrations
alembic downgrade -1                               # Rollback
```

## Default Admin User

On startup, if no admin user exists, one is created with credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables.

**Change these credentials immediately in production!**

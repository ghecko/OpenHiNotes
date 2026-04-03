# OpenHiNotes Backend — Quick Start

## 5-Minute Setup

### Prerequisites
- Python 3.11+
- PostgreSQL 13+
- Or Docker & Docker Compose

### Option 1: Local Development

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set up environment (from project root)
cp ../.env.example ../.env
# Edit ../.env with your settings

# 4. Start PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=openhinotes postgres:16-alpine

# 5. Run migrations
alembic upgrade head

# 6. Start server
uvicorn app.main:app --reload

# Server running at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Option 2: Docker Compose (recommended)

```bash
# From the project root
cp .env.example .env
# Edit .env with your settings
docker compose up --build
```

## First Steps

### 1. Admin Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@openhinotes.local", "password": "admin"}'
```

Save the `access_token` from the response.

### 2. Upload Audio & Transcribe
```bash
TOKEN="your-token-here"
curl -X POST http://localhost:8000/api/transcriptions/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/audio.mp3" \
  -F "language=en"
```

### 3. Create Summary Template (Admin)
```bash
curl -X POST http://localhost:8000/api/templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Executive Summary",
    "description": "Brief summary for executives",
    "prompt_template": "Summarize the following transcript in 3 bullet points:\n\n{{transcript}}",
    "is_active": true
  }'
```

### 4. Chat with Streaming
```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "What is this about?"}],
    "transcription_id": "optional-uuid"
  }'
```

## Common Issues

| Error | Fix |
|-------|-----|
| `Could not parse rfc1738 URL` | Check `DATABASE_URL` in `.env` |
| `VoxHub API error: 503` | Ensure [VoxHub](https://github.com/ghecko/VoxHub) is running at `VOXHUB_API_URL` |
| `LLM API error: 503` | Ensure LLM service is running at `LLM_API_URL` |
| `SSL: CERTIFICATE_VERIFY_FAILED` | Set `LLM_VERIFY_SSL=false` or `VOXHUB_VERIFY_SSL=false` in `.env` |
| `Address already in use` | Kill the process on port 8000 or use a different port |

## API Documentation

Interactive docs available at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Next Steps

- See [README.md](README.md) for full API endpoint reference
- See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture details
- See the root [`.env.example`](../.env.example) for all configuration options

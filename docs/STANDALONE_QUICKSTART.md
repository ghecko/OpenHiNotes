# Standalone Quick Start (no external reverse proxy)

This guide gets OpenHiNotes running on a single machine in under five minutes using a bundled Caddy container with a self-signed certificate — no external reverse proxy, no domain name, no extra setup.

> **Use this for:** local testing, evaluation, or a single-user home setup.
> **For production** (shared server, real domain, Let's Encrypt), see the [main README](../README.md).

---

## What's different from the default setup

| | Standalone | Default |
|---|---|---|
| Reverse proxy | Caddy bundled in compose | Your own (Caddy, Nginx, Traefik…) |
| TLS | Self-signed (browser warning) | Managed by your proxy |
| Ports exposed | 80 + 443 on the host | None |
| External Docker network | Not needed | `proxy-net` required |
| WebUSB (HiDock) | ✅ Works (HTTPS present) | ✅ Works |

---

## Prerequisites

- Docker and Docker Compose
- A running [VoxHub](https://github.com/ghecko/VoxHub) instance
- An OpenAI-compatible LLM endpoint (optional — needed for chat/summaries)

---

## Steps

### 1. Clone the repo

```bash
git clone https://github.com/ghecko/OpenHiNotes.git
cd OpenHiNotes
```

### 2. Create your `.env`

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
VOXHUB_API_URL=http://your-voxhub-host:8000
LLM_API_URL=http://host.docker.internal:11434/v1   # e.g. local Ollama
```

Everything else has sensible defaults for local use. You can leave `SITE_HOST` as `localhost`.

### 3. Start

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

This starts: PostgreSQL, FastAPI backend, React/Nginx frontend, and a Caddy reverse proxy with a self-signed certificate.

### 4. Open in your browser

Go to **https://localhost** and accept the self-signed certificate warning (click "Advanced" → "Proceed").

> Browsers flag self-signed certificates as untrusted — this is expected. The connection is still encrypted.

Log in with the default credentials:

| Field    | Default                    |
|----------|----------------------------|
| Email    | `admin@openhinotes.local`  |
| Password | `admin`                    |

**Change the password after your first login.**

---

## Optional: custom hostname or port

If port 443 is already in use, set `HTTPS_PORT` in your `.env`:

```env
HTTPS_PORT=8443
SITE_HOST=localhost
```

Then access the app at **https://localhost:8443**.

To use a custom local hostname (e.g. `hinotes.local`):

```env
SITE_HOST=hinotes.local
```

Add `127.0.0.1  hinotes.local` to your `/etc/hosts` (or `C:\Windows\System32\drivers\etc\hosts` on Windows), then open **https://hinotes.local**.

---

## Stopping and cleaning up

```bash
# Stop containers (keeps data)
docker compose -f docker-compose.standalone.yml down

# Stop and delete all data (volumes)
docker compose -f docker-compose.standalone.yml down -v
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 80 / 443 already in use | Set `HTTP_PORT` and `HTTPS_PORT` in `.env` |
| "Connection refused" on https://localhost | Wait ~30 s for the build to finish, then retry |
| VoxHub errors | Check `VOXHUB_API_URL` points to a running VoxHub instance |
| LLM errors | Check `LLM_API_URL`; for Ollama on the host use `http://host.docker.internal:11434/v1` |
| WebUSB not detecting device | Ensure you are on HTTPS (not HTTP) and using Chrome/Edge |

---

## Upgrading

```bash
git pull
docker compose -f docker-compose.standalone.yml up -d --build
```

Database migrations run automatically on startup.

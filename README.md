# OpenHiNotes

**Local-first audio transcription for HiDock devices.**

> 🔱 Fork of [sgeraldes/hidock-next](https://github.com/sgeraldes/hidock-next) — only the web app is retained. The desktop app, Electron app, meeting recorder, and audio-insights tools have been removed. The goal is to maintain a lightweight, browser-based tool for transcribing audio locally without depending on any specific cloud provider.

## Features

- **🎤 HiDock Device Integration** — Connect your HiDock H1, H1E, P1, or P1 Mini via WebUSB to browse and download recordings directly in the browser.
- **📝 Multi-Provider Transcription** — Choose between:
  - **Local WhisperX** — Self-hosted, OpenAI-compatible transcription (e.g., [whisperx-api-server](https://github.com/Nyralei/whisperx-api-server))
  - **OpenAI Cloud** — Official OpenAI Whisper API
  - **Google Gemini** — Transcription + AI-powered insight extraction (summary, sentiment, action items)
- **🎵 Audio Upload & Recording** — Upload audio files or record directly in the browser.
- **📋 Copy & Export** — Copy transcriptions to clipboard or export results.

## Quick Start

### Prerequisites

- **Node.js** 18+ and **npm**
- A transcription server (for local transcription):
  - [whisperx-api-server](https://github.com/Nyralei/whisperx-api-server) — recommended
  - Any OpenAI-compatible `/v1/audio/transcriptions` endpoint
  - Or use cloud providers (OpenAI, Gemini) with an API key

### Install & Run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/OpenHiNotes.git
cd OpenHiNotes

# Install dependencies
cd apps/web
npm install

# Start the development server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

### Configure a Provider

1. Go to **Settings** → **Transcription Provider**
2. Select your provider (Local WhisperX, OpenAI Cloud, or Google Gemini)
3. Enter the server URL and/or API key
4. Click **Test Connection** to verify
5. Save settings

## Docker Support

OpenHiNotes includes both development and production Docker setups. **Caddy** is used in both environments because the **WebUSB API (used to connect to HiDock devices) strictly requires a secure context (HTTPS)** if you are accessing the app from anywhere other than `localhost`.

### Production Setup

To run a highly-optimized, compiled build of the app using a multi-stage Docker build:

```bash
# Build and run the production container in the background
docker-compose -f docker-compose.prod.yml up -d --build
```

This will serve the production build on port 80. *If you need local network HTTPS (for WebUSB on other devices), you can pass a custom `Caddyfile` in the `docker-compose.prod.yml` to override the default `:80` configuration and use `tls internal`.*

### Development Setup (Hot-Reloading)

For easy local development with live hot-reloading (changes to `apps/web/src` update instantly without a rebuild):

```bash
# Start the web app and Caddy dev proxy in the background
docker-compose up -d

# View live logs
docker-compose logs -f web
```

- Access via HTTP: [http://localhost:5173](http://localhost:5173) (Direct Vite server)
- Access via HTTPS: [https://localhost](https://localhost) (Proxied via Caddy)

*Note: If you want to access the dev app from another device on your local network (e.g., `192.168.x.x`) and still use WebUSB, check the `Caddyfile` in the root folder for instructions on enabling local HTTPS.*

## Project Structure

```
OpenHiNotes/
├── apps/web/          # React + Vite web application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Dashboard, Recordings, Transcription, Settings
│   │   ├── services/      # Transcription service & providers
│   │   │   └── providers/ # WhisperX, OpenAI, Gemini provider implementations
│   │   ├── store/         # Zustand state management
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utility functions
│   └── package.json
├── run-web.sh         # Convenience launcher (Linux/macOS)
├── run-web.bat        # Convenience launcher (Windows)
└── Makefile           # Build targets
```

## Development

```bash
cd apps/web
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Lint code
```

## License

MIT License — see [LICENSE](LICENSE) for details.

## Credits

This project is a fork of [HiDock Next](https://github.com/sgeraldes/hidock-next) by sgeraldes, adapted for local-first transcription workflows.

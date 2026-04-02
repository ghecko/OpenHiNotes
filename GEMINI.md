# OpenHiNotes — AI Agent Context

## Project Overview
OpenHiNotes is a local-first audio transcription web app for HiDock devices.
Fork of [sgeraldes/hidock-next](https://github.com/sgeraldes/hidock-next) — web app only.

## Architecture
- **Framework**: React + TypeScript + Vite
- **Styling**: TailwindCSS
- **State**: Zustand (persisted to localStorage)
- **Routing**: React Router DOM

## Key Directories
```
frontend/src/
├── services/providers/   # Multi-provider transcription (WhisperX, OpenAI, Gemini)
├── services/             # Device service, audio processing, transcription orchestrator
├── pages/                # Dashboard, Recordings, Transcription, Settings
├── components/           # UI components (Layout, AudioPlayer, FileUpload, etc.)
├── store/                # Zustand app store
├── types/                # TypeScript interfaces
├── constants/            # App-wide constants, defaults, error messages
└── utils/                # Formatters, audio utilities
```

## Provider Architecture
The transcription system uses a pluggable provider pattern:
- `TranscriptionProvider` interface in `services/providers/types.ts`
- Implementations: `WhisperXProvider`, `OpenAIProvider`, `GeminiProvider`
- Factory: `createProvider(config)` in `services/providers/index.ts`
- Orchestrator: `transcriptionService` singleton in `services/transcriptionService.ts`

Providers declare capabilities (`{ transcription, insights }`). The UI conditionally
shows features based on these capabilities (e.g., insights only shown for Gemini).

## Device Integration
HiDock hardware communicates via WebUSB. The protocol is implemented in:
- `services/deviceService.ts` — full WebUSB protocol (file listing, download, firmware)
- `adapters/webDeviceAdapter.ts` — browser WebUSB adapter
- `interfaces/deviceInterface.ts` — device abstraction layer

## Settings
Stored in `localStorage` under key `hidock_settings`. Provider config includes:
- `providerType`: 'whisperx' | 'openai' | 'gemini'
- `providerBaseUrl`: server URL for whisperx/openai
- `providerApiKey`: API key for openai/gemini
- `providerModel`: model identifier

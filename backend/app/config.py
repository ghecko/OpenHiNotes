from pydantic_settings import BaseSettings
from typing import List, Union
import ssl


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/openhinotes"

    # Security
    secret_key: str = "your-secret-key-change-in-production"

    # VoxHub API (transcription)
    voxhub_api_url: str = "http://voxhub:8000"
    voxhub_api_key: str = ""
    voxhub_model: str = "large-v3"
    voxhub_job_mode: str = "false"
    # VAD mode for VoxHub's legacy pipeline. Empty = let VoxHub apply its own
    # default. "silero" carries NO speaker labels: combined with diarization
    # it silently yields a single SPEAKER_00, so it is no longer the default.
    voxhub_vad_mode: str = ""
    # VoxHub pipeline: "" (server default), "wordalign" or "legacy".
    voxhub_pipeline: str = ""

    # LLM API (OpenAI-compatible)
    llm_api_url: str = "http://localhost:11434/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-3.5-turbo"

    # SSL / TLS verification for outbound API calls
    # Set to "false" to disable SSL verification (dev only)
    # Set to a file path to use a custom CA bundle (e.g. /etc/ssl/certs/ca-certificates.crt)
    # Set to "true" (default) to use the system CA store
    llm_verify_ssl: str = "true"
    voxhub_verify_ssl: str = "true"

    # CORS
    cors_origins: List[str] = ["*"]

    # Admin defaults
    admin_email: str = "admin@openhinotes.local"
    admin_password: str = "admin"

    # File storage
    uploads_directory: str = "/app/uploads"

    # Voice embedding encryption key (hex string or passphrase).
    # If empty, a key is derived from SECRET_KEY automatically.
    # In production, set VOICE_EMBEDDING_KEY to a 64-char hex string
    # generated with: python -c "import os; print(os.urandom(32).hex())"
    voice_embedding_key: str = ""

    # Previous encryption key, used during key rotation only.
    # Set this to the OLD key when rotating to a new VOICE_EMBEDDING_KEY.
    # Once rotation is complete, remove this variable.
    voice_embedding_key_old: str = ""

    # OIDC client secret encryption key (hex string or passphrase).
    # If empty, a key is derived from SECRET_KEY automatically.
    # In production, set OIDC_ENCRYPTION_KEY to a 64-char hex string
    # generated with: python -c "import os; print(os.urandom(32).hex())"
    oidc_encryption_key: str = ""

    # Speaker matching threshold (cosine distance, 0.0 = identical, 1.0 = unrelated).
    # Measured in the pyannote/embedding space on HiDock meetings (VoxHub bench,
    # 2026-09-26): clusters of the same voice sit at 0.10-0.13 (0.28 on a degraded
    # phone call), clusters of different people at 0.35-0.48. 0.5 therefore let a
    # stranger match an enrolled profile; 0.3 keeps a margin on both sides. Check
    # the `distance` stored in transcriptions.speaker_matches (confirmed vs
    # rejected) before raising it again.
    speaker_match_threshold: float = 0.3

    # Public base URL for the frontend (used in notification emails). When
    # empty, completion emails still send but with a relative link — set
    # this in production to e.g. https://openhinotes.example.com so the
    # "Open transcription" CTA in emails goes to the right place.
    app_base_url: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False

    def get_ssl_verify(self, setting_value: str) -> Union[bool, str, ssl.SSLContext]:
        """Convert a verify_ssl setting string to the value httpx expects.

        Returns:
            - False          if setting is "false" (disable verification)
            - str (file path) if setting is a path to a CA bundle
            - True           otherwise (use system CA store)
        """
        val = setting_value.strip().lower()
        if val == "false":
            return False
        if val == "true":
            return True
        # Treat as a CA bundle file path
        return setting_value.strip()

    @property
    def llm_ssl_verify(self) -> Union[bool, str, ssl.SSLContext]:
        return self.get_ssl_verify(self.llm_verify_ssl)

    @property
    def voxhub_ssl_verify(self) -> Union[bool, str, ssl.SSLContext]:
        return self.get_ssl_verify(self.voxhub_verify_ssl)


settings = Settings()

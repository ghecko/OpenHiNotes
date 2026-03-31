from pydantic_settings import BaseSettings
from typing import List, Union
import ssl


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/openhinotes"

    # Security
    secret_key: str = "your-secret-key-change-in-production"

    # WhisperX / VoxBench API
    whisperx_api_url: str = "http://whisperx:8000"
    whisperx_api_key: str = ""
    whisperx_model: str = "large-v3"
    voxbench_job_mode: str = "false"

    # LLM API (OpenAI-compatible)
    llm_api_url: str = "http://localhost:11434/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-3.5-turbo"

    # SSL / TLS verification for outbound API calls
    # Set to "false" to disable SSL verification (dev only)
    # Set to a file path to use a custom CA bundle (e.g. /etc/ssl/certs/ca-certificates.crt)
    # Set to "true" (default) to use the system CA store
    llm_verify_ssl: str = "true"
    whisperx_verify_ssl: str = "true"

    # CORS
    cors_origins: List[str] = ["*"]

    # Admin defaults
    admin_email: str = "admin@openhinotes.local"
    admin_password: str = "admin"

    # File storage
    uploads_directory: str = "/app/uploads"

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
    def whisperx_ssl_verify(self) -> Union[bool, str, ssl.SSLContext]:
        return self.get_ssl_verify(self.whisperx_verify_ssl)


settings = Settings()

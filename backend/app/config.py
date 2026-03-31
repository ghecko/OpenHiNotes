from pydantic_settings import BaseSettings
from typing import List


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


settings = Settings()

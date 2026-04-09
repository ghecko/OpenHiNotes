from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.dependencies import require_admin, get_current_user
from app.models.user import User
from app.models.app_settings import AppSetting
from app.config import settings as env_settings
from app.services.registration import RegistrationSettingsService

router = APIRouter(prefix="/settings", tags=["settings"])

# Settings keys that can be configured through the admin UI
CONFIGURABLE_KEYS = {
    "voice_fingerprinting_enabled": {
        "description": "Enable speaker voice fingerprinting (users can record voice profiles for auto-identification)",
        "default_from_env": "",
    },
    "voxhub_api_url": {
        "description": "VoxHub API base URL (e.g. http://server:8000)",
        "default_from_env": "voxhub_api_url",
    },
    "voxhub_api_key": {
        "description": "VoxHub API key (leave empty if no auth required)",
        "default_from_env": "voxhub_api_key",
        "sensitive": True,
    },
    "voxhub_model": {
        "description": "Transcription model (e.g. whisper:turbo, voxtral:mini-4b, large-v3)",
        "default_from_env": "voxhub_model",
    },
    "voxhub_job_mode": {
        "description": "Enable async Job Mode for long recordings (true/false)",
        "default_from_env": "voxhub_job_mode",
    },
    "voxhub_vad_mode": {
        "description": "VAD strategy: silero (fast), pyannote (accurate), hybrid (best recall+precision), none (pre-segmented)",
        "default_from_env": "voxhub_vad_mode",
    },
    "llm_api_url": {
        "description": "LLM API base URL (OpenAI-compatible endpoint)",
        "default_from_env": "llm_api_url",
    },
    "llm_api_key": {
        "description": "LLM API key (leave empty for local models like Ollama)",
        "default_from_env": "llm_api_key",
        "sensitive": True,
    },
    "llm_model": {
        "description": "LLM model name (e.g. gpt-4, llama3, mistral)",
        "default_from_env": "llm_model",
    },
}


class SettingUpdate(BaseModel):
    value: str


class SettingResponse(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    source: str  # "database" or "environment"


class SettingsResponse(BaseModel):
    settings: list[SettingResponse]


def _get_env_default(key: str) -> str:
    """Get the environment variable default for a setting."""
    env_attr = CONFIGURABLE_KEYS.get(key, {}).get("default_from_env", key)
    return getattr(env_settings, env_attr, "")


@router.get("", response_model=SettingsResponse)
async def get_settings(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get all configurable settings (admin only)."""
    # Fetch all saved settings from DB
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(CONFIGURABLE_KEYS.keys()))
    )
    db_settings = {s.key: s for s in result.scalars().all()}

    settings_list = []
    for key, meta in CONFIGURABLE_KEYS.items():
        if key in db_settings:
            value = db_settings[key].value
            # Mask sensitive values
            if meta.get("sensitive") and value:
                display_value = value[:4] + "..." + value[-4:] if len(value) > 8 else "****"
            else:
                display_value = value
            settings_list.append(
                SettingResponse(
                    key=key,
                    value=display_value,
                    description=meta["description"],
                    source="database",
                )
            )
        else:
            env_val = _get_env_default(key)
            if meta.get("sensitive") and env_val:
                display_value = env_val[:4] + "..." + env_val[-4:] if len(env_val) > 8 else "****"
            else:
                display_value = env_val
            settings_list.append(
                SettingResponse(
                    key=key,
                    value=display_value,
                    description=meta["description"],
                    source="environment",
                )
            )

    return SettingsResponse(settings=settings_list)


# ── Feature Flags (readable by all authenticated users) ──────────────

FEATURE_FLAG_KEYS = {"voice_fingerprinting_enabled"}


@router.get("/features")
async def get_feature_flags(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get feature flags (available to all authenticated users)."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key.in_(FEATURE_FLAG_KEYS))
    )
    db_settings = {s.key: s.value for s in result.scalars().all()}

    flags = {}
    for key in FEATURE_FLAG_KEYS:
        flags[key] = db_settings.get(key, "false").lower() == "true"
    return flags


# ── Registration Settings ──────────────────────────────────────────────
# These must be defined BEFORE the generic /{key} routes below,
# otherwise FastAPI matches PUT /settings/registration to /{key}
# with key="registration", causing a 422.


class RegistrationSettingsUpdate(BaseModel):
    registration_enabled: Optional[bool] = None
    approval_required: Optional[bool] = None
    allowed_domains: Optional[list[str]] = None


@router.get("/registration")
async def get_registration_settings(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get registration settings (admin only)."""
    data = await RegistrationSettingsService.get_all(db)
    return data


@router.put("/registration")
async def update_registration_settings(
    body: RegistrationSettingsUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update registration settings (admin only)."""
    if body.registration_enabled is not None:
        await RegistrationSettingsService.set_registration_enabled(db, body.registration_enabled)
    if body.approval_required is not None:
        await RegistrationSettingsService.set_approval_required(db, body.approval_required)
    if body.allowed_domains is not None:
        await RegistrationSettingsService.set_allowed_domains(db, body.allowed_domains)
    await db.commit()
    return await RegistrationSettingsService.get_all(db)


# ── Audio / Keep-Audio Settings ───────────────────────────────────────

KEEP_AUDIO_SETTING_KEY = "keep_audio_enabled"


class KeepAudioSettingsUpdate(BaseModel):
    keep_audio_enabled: bool


@router.get("/audio")
async def get_audio_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get audio-related settings. Available to all authenticated users."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == KEEP_AUDIO_SETTING_KEY)
    )
    setting = result.scalars().first()
    keep_audio_enabled = setting.value.lower() == "true" if setting else True  # default: enabled
    return {"keep_audio_enabled": keep_audio_enabled}


@router.put("/audio")
async def update_audio_settings(
    body: KeepAudioSettingsUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update audio settings (admin only)."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == KEEP_AUDIO_SETTING_KEY)
    )
    setting = result.scalars().first()

    if setting:
        setting.value = str(body.keep_audio_enabled).lower()
    else:
        setting = AppSetting(
            key=KEEP_AUDIO_SETTING_KEY,
            value=str(body.keep_audio_enabled).lower(),
            description="Allow users to keep audio files with their transcriptions",
        )
        db.add(setting)

    await db.commit()
    return {"keep_audio_enabled": body.keep_audio_enabled}


# ── Generic key/value settings ─────────────────────────────────────────


@router.put("/{key}")
async def update_setting(
    key: str,
    body: SettingUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a single setting (admin only)."""
    if key not in CONFIGURABLE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting: {key}")

    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalars().first()

    if setting:
        setting.value = body.value
    else:
        setting = AppSetting(
            key=key,
            value=body.value,
            description=CONFIGURABLE_KEYS[key]["description"],
        )
        db.add(setting)

    await db.commit()
    return {"key": key, "status": "updated"}


@router.delete("/{key}")
async def reset_setting(
    key: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reset a setting to its environment default (admin only)."""
    if key not in CONFIGURABLE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting: {key}")

    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalars().first()

    if setting:
        await db.delete(setting)
        await db.commit()

    return {"key": key, "status": "reset_to_default"}

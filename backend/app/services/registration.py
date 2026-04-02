"""Service for registration settings — reads from app_settings table."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.app_settings import AppSetting
from typing import Optional


# Default values when settings are not in the database
_DEFAULTS = {
    "registration_enabled": "true",
    "registration_approval_required": "false",
    "registration_allowed_domains": "",
}


class RegistrationSettingsService:
    """Read and write registration-related settings from app_settings."""

    @staticmethod
    async def _get(db: AsyncSession, key: str) -> str:
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalars().first()
        return row.value if row else _DEFAULTS.get(key, "")

    @staticmethod
    async def _set(db: AsyncSession, key: str, value: str, description: Optional[str] = None) -> None:
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        row = result.scalars().first()
        if row:
            row.value = value
        else:
            row = AppSetting(key=key, value=value, description=description or key)
            db.add(row)

    # ---- public getters ----

    @staticmethod
    async def is_registration_enabled(db: AsyncSession) -> bool:
        val = await RegistrationSettingsService._get(db, "registration_enabled")
        return val.lower() == "true"

    @staticmethod
    async def is_approval_required(db: AsyncSession) -> bool:
        val = await RegistrationSettingsService._get(db, "registration_approval_required")
        return val.lower() == "true"

    @staticmethod
    async def get_allowed_domains(db: AsyncSession) -> list[str]:
        val = await RegistrationSettingsService._get(db, "registration_allowed_domains")
        if not val or not val.strip():
            return []
        return [d.strip().lower() for d in val.split(",") if d.strip()]

    @staticmethod
    async def get_all(db: AsyncSession) -> dict:
        """Return all registration settings as a dict."""
        return {
            "registration_enabled": await RegistrationSettingsService.is_registration_enabled(db),
            "approval_required": await RegistrationSettingsService.is_approval_required(db),
            "allowed_domains": await RegistrationSettingsService.get_allowed_domains(db),
        }

    # ---- public setters ----

    @staticmethod
    async def set_registration_enabled(db: AsyncSession, enabled: bool) -> None:
        await RegistrationSettingsService._set(
            db, "registration_enabled", str(enabled).lower(),
            "Allow public self-registration"
        )

    @staticmethod
    async def set_approval_required(db: AsyncSession, required: bool) -> None:
        await RegistrationSettingsService._set(
            db, "registration_approval_required", str(required).lower(),
            "Require admin approval for new registrations"
        )

    @staticmethod
    async def set_allowed_domains(db: AsyncSession, domains: list[str]) -> None:
        cleaned = ",".join(d.strip().lower() for d in domains if d.strip())
        await RegistrationSettingsService._set(
            db, "registration_allowed_domains", cleaned,
            "Comma-separated list of allowed email domains (empty = all domains)"
        )

    @staticmethod
    def validate_email_domain(email: str, allowed_domains: list[str]) -> bool:
        """Check if email domain is in allowed list. Empty list = all domains allowed."""
        if not allowed_domains:
            return True
        domain = email.rsplit("@", 1)[-1].lower()
        return domain in allowed_domains

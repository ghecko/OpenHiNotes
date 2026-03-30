"""Service to resolve runtime settings from database with env fallback."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.app_settings import AppSetting
from app.config import settings as env_settings


async def get_effective_setting(db: AsyncSession, key: str) -> str:
    """Get the effective value for a setting key.

    Checks the database first, falls back to the environment variable.
    """
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    db_setting = result.scalars().first()

    if db_setting and db_setting.value:
        return db_setting.value

    # Fall back to environment config
    return getattr(env_settings, key, "")

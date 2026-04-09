"""Voice profile management endpoints.

Allows users to:
- Record/upload a voice sample and extract a speaker embedding
- List their own voice profiles
- Delete a voice profile
- Test speaker matching against a sample audio

GDPR notes:
- Only the owning user can access their profiles
- Admins can list profiles (metadata only) and delete on behalf of users
- Embeddings are never exposed in API responses
- Deleting a profile permanently removes the encrypted embedding
"""

import os
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.user import User, UserRole
from app.schemas.voice_profile import (
    VoiceProfileCreate,
    VoiceProfileListResponse,
    VoiceProfileResponse,
    SpeakerMatchResult,
)
from app.models.voice_profile import VoiceProfile
from app.services import speaker_identification as si

router = APIRouter(prefix="/voice-profiles", tags=["voice-profiles"])


async def _check_feature_enabled(db: AsyncSession) -> None:
    """Raise 403 if voice fingerprinting is disabled by admin."""
    from app.models.app_settings import AppSetting
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "voice_fingerprinting_enabled")
    )
    setting = result.scalars().first()
    if not setting or setting.value.lower() != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voice fingerprinting is disabled by the administrator",
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _save_temp_audio(file: UploadFile, user_id: uuid.UUID) -> str:
    """Save uploaded audio to a temp location and return the path.

    The file is cleaned up after embedding extraction.
    """
    user_dir = Path(settings.uploads_directory) / str(user_id) / "voice_temp"
    user_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid.uuid4()
    ext = Path(file.filename).suffix if file.filename else ".wav"
    file_path = user_dir / f"{file_id}{ext}"

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    return str(file_path)


def _cleanup_temp_file(path: str) -> None:
    """Remove a temporary audio file."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=VoiceProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_voice_profile(
    file: UploadFile = File(...),
    label: str = Form("My voice"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a voice sample and create a voice profile.

    The audio is sent to VoxHub for embedding extraction, then the embedding
    is encrypted and stored. The audio file is deleted immediately after.
    """
    await _check_feature_enabled(db)

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided",
        )

    temp_path = await _save_temp_audio(file, current_user.id)
    try:
        # Extract embedding via VoxHub
        embedding = await si.extract_embedding_via_voxhub(temp_path, db=db)

        # Encrypt and store
        profile = await si.create_voice_profile(
            db, user_id=current_user.id, embedding=embedding, label=label
        )
        return profile
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create voice profile: {str(e)}",
        )
    finally:
        _cleanup_temp_file(temp_path)


@router.get("", response_model=VoiceProfileListResponse)
async def list_my_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the current user's voice profiles."""
    profiles = await si.get_user_profiles(db, current_user.id)
    return VoiceProfileListResponse(profiles=profiles, total=len(profiles))


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    profile_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete one of the current user's voice profiles.

    This permanently removes the encrypted embedding from the database.
    """
    deleted = await si.delete_voice_profile(db, profile_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice profile not found or does not belong to you",
        )


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_my_profiles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL voice profiles for the current user (GDPR right to erasure)."""
    await si.delete_all_user_profiles(db, current_user.id)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/user/{user_id}", response_model=VoiceProfileListResponse)
async def admin_list_user_profiles(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List voice profiles for a specific user (admin only, metadata only)."""
    profiles = await si.get_user_profiles(db, user_id)
    return VoiceProfileListResponse(profiles=profiles, total=len(profiles))


@router.delete("/admin/user/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user_profiles(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL voice profiles for a specific user (admin only).

    The user account is NOT affected — only their embeddings are removed.
    The user will see a notice next time they visit Settings, and can re-record.
    """
    count = await si.delete_all_user_profiles(db, user_id)
    if count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No voice profiles found for this user",
        )


@router.delete("/admin/profile/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_single_profile(
    profile_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a specific voice profile by ID (admin only).

    Useful when an admin needs to remove one embedding without wiping all
    of a user's profiles.
    """
    result = await db.execute(
        select(VoiceProfile).where(VoiceProfile.id == profile_id)
    )
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voice profile not found",
        )
    await db.delete(profile)
    await db.commit()


@router.delete("/admin/all", status_code=status.HTTP_204_NO_CONTENT)
async def admin_purge_all_profiles(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete ALL voice profiles for ALL users (admin only).

    Use with caution — this is irreversible. Typical use case: encryption key
    rotation or a security incident requiring full purge. All users will need
    to re-record their voice.
    """
    from sqlalchemy import delete as sa_delete
    result = await db.execute(sa_delete(VoiceProfile))
    await db.commit()
    import logging
    logging.getLogger(__name__).info(
        "Admin %s purged all voice profiles (%d deleted)", current_user.email, result.rowcount
    )


@router.post("/admin/rotate-key", status_code=status.HTTP_200_OK)
async def admin_rotate_encryption_key(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Re-encrypt all voice embeddings from the old key to the new key.

    Prerequisites:
      1. Set VOICE_EMBEDDING_KEY to the NEW key.
      2. Set VOICE_EMBEDDING_KEY_OLD to the PREVIOUS key.
      3. Call this endpoint.
      4. After success, remove VOICE_EMBEDDING_KEY_OLD from the environment.

    Returns counts of rotated, failed, and total profiles.
    """
    try:
        result = await si.rotate_encryption_key(db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Key rotation failed: {str(e)}",
        )

    import logging
    logging.getLogger(__name__).info(
        "Admin %s triggered key rotation: %s", current_user.email, result
    )
    return result

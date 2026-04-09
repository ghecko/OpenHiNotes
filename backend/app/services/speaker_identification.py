"""Speaker identification service.

Handles:
- Encrypting / decrypting voice embeddings (AES-256-GCM)
- Sending audio to VoxHub for embedding extraction
- Comparing speaker embeddings via cosine distance
- Matching unknown speakers against all active voice profiles

Encryption rationale:
  Voice embeddings are biometric data under GDPR. We encrypt them at rest
  using AES-256-GCM with a server-side key (VOICE_EMBEDDING_KEY env var).
  Each embedding gets a unique 12-byte nonce.  The key never leaves the
  server; if the database is compromised, the embeddings are useless
  without the key.
"""

import hashlib
import json
import logging
import os
import struct
import uuid
from typing import Dict, List, Optional, Tuple

import httpx
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.voice_profile import VoiceProfile
from app.schemas.voice_profile import SpeakerMatchResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------

def _derive_key_from_raw(raw_key: str) -> bytes:
    """Derive a 256-bit AES key from a raw key string.

    - 64-char hex string → decoded directly as 32 bytes
    - Any other string   → SHA-256 hashed to 32 bytes
    """
    if len(raw_key) == 64:
        try:
            return bytes.fromhex(raw_key)
        except ValueError:
            pass
    return hashlib.sha256(raw_key.encode()).digest()


def _get_encryption_key() -> bytes:
    """Derive a 256-bit AES key from the configured secret.

    Uses VOICE_EMBEDDING_KEY if set, otherwise falls back to
    a HKDF derivation from SECRET_KEY (so the feature works out of
    the box in development without an extra env var).
    """
    raw_key = os.getenv("VOICE_EMBEDDING_KEY", "")
    if raw_key:
        return _derive_key_from_raw(raw_key)

    # Fallback: derive from the app's SECRET_KEY
    return hashlib.sha256(f"voice-embedding-{settings.secret_key}".encode()).digest()


def _get_old_encryption_key() -> Optional[bytes]:
    """Get the previous encryption key for key rotation.

    Returns None if VOICE_EMBEDDING_KEY_OLD is not set.
    """
    raw_key = os.getenv("VOICE_EMBEDDING_KEY_OLD", "")
    if not raw_key:
        return None
    return _derive_key_from_raw(raw_key)


def encrypt_embedding(embedding: List[float]) -> Tuple[bytes, bytes, bytes]:
    """Encrypt a float embedding vector using AES-256-GCM.

    Args:
        embedding: List of floats (typically 512 values).

    Returns:
        (ciphertext, nonce, tag) — all bytes objects.
    """
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM

    # Serialize floats as packed binary (much smaller than JSON)
    plaintext = struct.pack(f"<{len(embedding)}f", *embedding)

    # GCM encrypt returns ciphertext + tag concatenated
    ct_with_tag = aesgcm.encrypt(nonce, plaintext, None)

    # Split: last 16 bytes are the GCM tag
    ciphertext = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]

    return ciphertext, nonce, tag


def decrypt_embedding(ciphertext: bytes, nonce: bytes, tag: bytes) -> List[float]:
    """Decrypt an AES-256-GCM encrypted embedding back to a list of floats.

    Raises:
        cryptography.exceptions.InvalidTag: If the data was tampered with.
    """
    return _decrypt_embedding_with_key(_get_encryption_key(), ciphertext, nonce, tag)


def _decrypt_embedding_with_key(
    key: bytes, ciphertext: bytes, nonce: bytes, tag: bytes
) -> List[float]:
    """Decrypt an embedding using a specific key."""
    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(nonce, ciphertext + tag, None)
    num_floats = len(plaintext) // 4
    return list(struct.unpack(f"<{num_floats}f", plaintext))


def _encrypt_embedding_with_key(
    key: bytes, embedding: List[float]
) -> Tuple[bytes, bytes, bytes]:
    """Encrypt an embedding using a specific key."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = struct.pack(f"<{len(embedding)}f", *embedding)
    ct_with_tag = aesgcm.encrypt(nonce, plaintext, None)
    ciphertext = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return ciphertext, nonce, tag


# ---------------------------------------------------------------------------
# Key rotation
# ---------------------------------------------------------------------------

async def rotate_encryption_key(db: AsyncSession) -> Dict[str, int]:
    """Re-encrypt all voice profiles from the old key to the new key.

    Prerequisites:
      1. Set VOICE_EMBEDDING_KEY to the NEW key.
      2. Set VOICE_EMBEDDING_KEY_OLD to the PREVIOUS key.
      3. Call this function (via the admin API or CLI).
      4. After success, remove VOICE_EMBEDDING_KEY_OLD from the environment.

    Returns:
        {"rotated": n, "failed": m, "total": t}
    """
    old_key = _get_old_encryption_key()
    if old_key is None:
        raise ValueError(
            "VOICE_EMBEDDING_KEY_OLD is not set. "
            "Set it to the previous key before rotating."
        )

    new_key = _get_encryption_key()
    if old_key == new_key:
        raise ValueError(
            "Old and new encryption keys are identical. "
            "Set VOICE_EMBEDDING_KEY to the new key and "
            "VOICE_EMBEDDING_KEY_OLD to the previous key."
        )

    # Load all profiles (including inactive)
    result = await db.execute(select(VoiceProfile))
    all_profiles = list(result.scalars().all())

    rotated = 0
    failed = 0

    for vp in all_profiles:
        try:
            # Decrypt with old key
            embedding = _decrypt_embedding_with_key(
                old_key, vp.encrypted_embedding, vp.encryption_nonce, vp.encryption_tag
            )
            # Re-encrypt with new key
            ciphertext, nonce, tag = _encrypt_embedding_with_key(new_key, embedding)
            # Update the row
            vp.encrypted_embedding = ciphertext
            vp.encryption_nonce = nonce
            vp.encryption_tag = tag
            rotated += 1
        except Exception as e:
            logger.error("Key rotation failed for profile %s: %s", vp.id, e)
            failed += 1

    await db.commit()

    logger.info(
        "Key rotation complete: %d rotated, %d failed, %d total",
        rotated, failed, len(all_profiles),
    )
    return {"rotated": rotated, "failed": failed, "total": len(all_profiles)}


# ---------------------------------------------------------------------------
# VoxHub embedding extraction
# ---------------------------------------------------------------------------

async def extract_embedding_via_voxhub(
    file_path: str,
    db: Optional[AsyncSession] = None,
) -> List[float]:
    """Send an audio file to VoxHub and get back a 512-dim speaker embedding.

    Uses the new ``POST /v1/audio/embeddings`` endpoint on VoxHub.
    """
    from app.services.transcription import TranscriptionService

    cfg = await TranscriptionService._resolve_transcription_settings(db)
    headers = TranscriptionService._build_auth_headers(cfg["api_key"])
    url = f"{cfg['api_url']}/v1/audio/embeddings"

    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f, "audio/mpeg")}
        async with httpx.AsyncClient(
            timeout=60.0, verify=settings.voxhub_ssl_verify
        ) as client:
            response = await client.post(url, files=files, headers=headers)

    if response.status_code != 200:
        raise Exception(
            f"VoxHub embedding extraction failed: {response.status_code} - {response.text}"
        )

    data = response.json()
    embedding = data.get("embedding")
    if not embedding or not isinstance(embedding, list):
        raise Exception("VoxHub returned invalid embedding response")

    return embedding


# ---------------------------------------------------------------------------
# Cosine distance
# ---------------------------------------------------------------------------

def cosine_distance(a: List[float], b: List[float]) -> float:
    """Compute cosine distance between two vectors.

    Returns a value in [0, 2]:
      0.0 = identical
      1.0 = orthogonal
      2.0 = opposite

    For speaker verification, a threshold of ~0.5 is common.
    """
    va = np.array(a, dtype=np.float64)
    vb = np.array(b, dtype=np.float64)
    dot = np.dot(va, vb)
    norm = np.linalg.norm(va) * np.linalg.norm(vb)
    if norm == 0:
        return 1.0
    return float(1.0 - dot / norm)


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------

async def create_voice_profile(
    db: AsyncSession,
    user_id: uuid.UUID,
    embedding: List[float],
    label: str = "My voice",
) -> VoiceProfile:
    """Encrypt and store a voice embedding for a user."""
    ciphertext, nonce, tag = encrypt_embedding(embedding)

    profile = VoiceProfile(
        user_id=user_id,
        label=label,
        encrypted_embedding=ciphertext,
        encryption_nonce=nonce,
        encryption_tag=tag,
        embedding_dim=len(embedding),
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def get_user_profiles(
    db: AsyncSession, user_id: uuid.UUID
) -> List[VoiceProfile]:
    """Get all voice profiles for a user."""
    result = await db.execute(
        select(VoiceProfile)
        .where(VoiceProfile.user_id == user_id, VoiceProfile.is_active == True)  # noqa: E712
        .order_by(VoiceProfile.created_at.desc())
    )
    return list(result.scalars().all())


async def delete_voice_profile(
    db: AsyncSession, profile_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    """Delete a voice profile. Returns True if found and deleted."""
    result = await db.execute(
        select(VoiceProfile).where(
            VoiceProfile.id == profile_id,
            VoiceProfile.user_id == user_id,
        )
    )
    profile = result.scalars().first()
    if not profile:
        return False
    await db.delete(profile)
    await db.commit()
    return True


async def delete_all_user_profiles(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Delete ALL voice profiles for a user. Returns count deleted.

    Called when a user is deactivated or requests data deletion (GDPR).
    """
    from sqlalchemy import delete as sa_delete

    result = await db.execute(
        sa_delete(VoiceProfile).where(VoiceProfile.user_id == user_id)
    )
    await db.commit()
    return result.rowcount


# ---------------------------------------------------------------------------
# Speaker matching
# ---------------------------------------------------------------------------

async def load_all_active_embeddings(
    db: AsyncSession,
) -> List[Tuple[uuid.UUID, uuid.UUID, str, str, List[float]]]:
    """Load and decrypt all active voice profiles.

    Returns list of (profile_id, user_id, user_display_name, label, embedding).
    """
    result = await db.execute(
        select(VoiceProfile, User.display_name)
        .join(User, VoiceProfile.user_id == User.id)
        .where(
            VoiceProfile.is_active == True,  # noqa: E712
            User.is_active == True,  # noqa: E712
        )
    )
    rows = result.all()

    profiles = []
    for vp, display_name in rows:
        try:
            embedding = decrypt_embedding(
                vp.encrypted_embedding, vp.encryption_nonce, vp.encryption_tag
            )
            profiles.append((vp.id, vp.user_id, display_name or "Unknown", vp.label, embedding))
        except Exception as e:
            logger.error("Failed to decrypt voice profile %s: %s", vp.id, e)
            continue

    return profiles


async def is_feature_enabled(db: AsyncSession) -> bool:
    """Check if voice fingerprinting is enabled by admin."""
    from app.models.app_settings import AppSetting

    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "voice_fingerprinting_enabled")
    )
    setting = result.scalars().first()
    return setting is not None and setting.value.lower() == "true"


async def match_speakers(
    db: AsyncSession,
    speaker_embeddings: Dict[str, Dict],
    threshold: float = 0.5,
) -> List[SpeakerMatchResult]:
    """Match speaker embeddings from a transcription against all known profiles.

    Args:
        db: Database session.
        speaker_embeddings: Dict from VoxHub response, e.g.
            {"SPEAKER_00": {"embedding": [...], "embedding_dim": 512, ...}, ...}
        threshold: Cosine distance threshold. Below this = match.

    Returns:
        List of SpeakerMatchResult for each input speaker.
    """
    if not speaker_embeddings:
        return []

    # Check if feature is enabled by admin
    if not await is_feature_enabled(db):
        logger.info("Voice fingerprinting disabled by admin, skipping speaker matching")
        return []

    # Load all known profiles (decrypted in memory)
    known_profiles = await load_all_active_embeddings(db)
    if not known_profiles:
        logger.info("No active voice profiles found for speaker matching")
        return []

    results = []
    for speaker_label, speaker_data in speaker_embeddings.items():
        unknown_embedding = speaker_data.get("embedding", [])
        if not unknown_embedding:
            results.append(SpeakerMatchResult(speaker_label=speaker_label))
            continue

        best_distance = float("inf")
        best_profile = None

        for profile_id, user_id, display_name, label, known_embedding in known_profiles:
            dist = cosine_distance(unknown_embedding, known_embedding)
            if dist < best_distance:
                best_distance = dist
                best_profile = (profile_id, user_id, display_name)

        if best_distance < threshold and best_profile:
            profile_id, user_id, display_name = best_profile
            results.append(
                SpeakerMatchResult(
                    speaker_label=speaker_label,
                    matched_user_id=user_id,
                    matched_display_name=display_name,
                    matched_profile_id=profile_id,
                    confidence=round(1.0 - best_distance, 4),
                    distance=round(best_distance, 4),
                )
            )
            logger.info(
                "Speaker %s matched to %s (distance=%.4f)",
                speaker_label,
                display_name,
                best_distance,
            )
        else:
            results.append(
                SpeakerMatchResult(
                    speaker_label=speaker_label,
                    distance=round(best_distance, 4) if best_distance < float("inf") else None,
                )
            )

    return results


def apply_speaker_matches(
    speakers: Dict[str, str],
    matches: List[SpeakerMatchResult],
) -> Dict[str, str]:
    """Apply speaker match results to the transcription's speakers dict.

    For each matched speaker, replaces the generic label with the user's
    display name. Unmatched speakers keep their original label.

    Args:
        speakers: Current speakers dict, e.g. {"SPEAKER_00": "SPEAKER_00"}
        matches: Results from match_speakers().

    Returns:
        Updated speakers dict.
    """
    updated = dict(speakers)
    for match in matches:
        if match.matched_display_name:
            updated[match.speaker_label] = match.matched_display_name
    return updated

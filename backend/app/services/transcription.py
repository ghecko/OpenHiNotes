import asyncio
import httpx
import inspect
import json
import logging
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator, Callable, Union
from fastapi import UploadFile
from app.config import settings
from app.models.transcription import Transcription, TranscriptionStatus
from app.models.summary import Summary
from app.models.chat_conversation import ChatConversation
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
import os

logger = logging.getLogger(__name__)


async def _call_progress(on_progress, *args):
    """Call a progress callback, awaiting it if it's async."""
    if on_progress is None:
        return
    result = on_progress(*args)
    if inspect.isawaitable(result):
        await result


class TranscriptionService:
    """Service for transcription operations."""

    @staticmethod
    async def save_uploaded_file(file: UploadFile, user_id: uuid.UUID) -> tuple[str, str]:
        """Save uploaded audio file and return stored filename and original filename."""
        # Create user-specific directory
        user_dir = Path(settings.uploads_directory) / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        file_id = uuid.uuid4()
        file_extension = Path(file.filename).suffix
        stored_filename = f"{file_id}{file_extension}"
        file_path = user_dir / stored_filename

        # Save file
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        return str(stored_filename), file.filename

    @staticmethod
    async def _resolve_transcription_settings(db: Optional[AsyncSession] = None) -> Dict[str, str]:
        """Resolve transcription settings from DB or env."""
        if db:
            from app.services.settings_service import get_effective_setting
            return {
                "api_url": await get_effective_setting(db, "voxhub_api_url"),
                "api_key": await get_effective_setting(db, "voxhub_api_key"),
                "model": await get_effective_setting(db, "voxhub_model"),
                "job_mode": (await get_effective_setting(db, "voxhub_job_mode")).lower() == "true",
                "vad_mode": await get_effective_setting(db, "voxhub_vad_mode"),
            }
        return {
            "api_url": settings.voxhub_api_url,
            "api_key": settings.voxhub_api_key,
            "model": settings.voxhub_model,
            "job_mode": settings.voxhub_job_mode.lower() == "true",
            "vad_mode": settings.voxhub_vad_mode,
        }

    @staticmethod
    def _build_auth_headers(api_key: str) -> Dict[str, str]:
        """Build auth headers if an API key is configured."""
        if api_key:
            return {"Authorization": f"Bearer {api_key}"}
        return {}

    @staticmethod
    async def transcribe_with_voxhub(
        file_path: str,
        language: Optional[str] = None,
        db: Optional[AsyncSession] = None,
        on_progress: Optional[Callable[[str, float, Optional[str]], None]] = None,
        on_job_submitted: Optional[Callable[[str], Any]] = None,
    ) -> Dict[str, Any]:
        """Call VoxHub/WhisperX API to transcribe audio file.

        Supports two modes:
        - Normal (synchronous): POST /v1/audio/transcriptions
        - Job (asynchronous): POST /v1/audio/transcriptions/jobs → poll → fetch result

        Args:
            on_job_submitted: optional callback(job_id) called after job is submitted in job mode.
        """
        cfg = await TranscriptionService._resolve_transcription_settings(db)
        headers = TranscriptionService._build_auth_headers(cfg["api_key"])

        if cfg["job_mode"]:
            return await TranscriptionService._transcribe_job_mode(
                file_path, language, cfg, headers,
                on_progress=on_progress, on_job_submitted=on_job_submitted,
            )
        else:
            return await TranscriptionService._transcribe_normal_mode(file_path, language, cfg, headers)

    @staticmethod
    async def _transcribe_normal_mode(
        file_path: str,
        language: Optional[str],
        cfg: Dict[str, Any],
        headers: Dict[str, str],
    ) -> Dict[str, Any]:
        """Synchronous transcription — single POST, wait for response."""
        url = f"{cfg['api_url']}/v1/audio/transcriptions"

        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f, "audio/mpeg")}
            vad_mode = cfg.get("vad_mode") or "silero"
            data = {
                "model": cfg["model"],
                "response_format": "verbose_json",
                "diarize": "true",
                "vad_mode": vad_mode,
                "return_speaker_embeddings": "true",
            }
            if language:
                data["language"] = language

            async with httpx.AsyncClient(timeout=300.0, verify=settings.voxhub_ssl_verify) as client:
                response = await client.post(url, files=files, data=data, headers=headers)

        if response.status_code != 200:
            raise Exception(f"Transcription API error: {response.status_code} - {response.text}")

        return response.json()

    @staticmethod
    async def _transcribe_job_mode(
        file_path: str,
        language: Optional[str],
        cfg: Dict[str, Any],
        headers: Dict[str, str],
        on_progress: Optional[Callable[[str, float, Optional[str]], None]] = None,
        on_job_submitted: Optional[Callable[[str], Any]] = None,
    ) -> Dict[str, Any]:
        """Async VoxHub Job Mode — submit, poll, fetch result.

        Args:
            on_progress: optional callback(status, progress_percent) called on each poll.
            on_job_submitted: optional callback(job_id) called after job is submitted.
        """
        base = cfg["api_url"]

        # Step 1: Submit job
        submit_url = f"{base}/v1/audio/transcriptions/jobs"
        logger.info("VoxHub Job Mode: submitting job to %s", submit_url)

        await _call_progress(on_progress, "uploading", 0, "uploading")

        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f, "audio/mpeg")}
            vad_mode = cfg.get("vad_mode") or "silero"
            data = {
                "model": cfg["model"],
                "diarize": "true",
                "vad_mode": vad_mode,
                "return_speaker_embeddings": "true",
            }
            if language:
                data["language"] = language

            async with httpx.AsyncClient(timeout=60.0, verify=settings.voxhub_ssl_verify) as client:
                response = await client.post(submit_url, files=files, data=data, headers=headers)

        if response.status_code not in (200, 201, 202):
            raise Exception(f"VoxHub job submit error: {response.status_code} - {response.text}")

        job_data = response.json()
        job_id = job_data.get("job_id") or job_data.get("id")
        if not job_id:
            raise Exception(f"VoxHub job submit returned no job_id: {job_data}")

        logger.info("VoxHub Job Mode: job submitted, id=%s", job_id)

        # Notify caller of job_id so it can be stored for cancellation
        if on_job_submitted:
            await _call_progress(on_job_submitted, job_id)

        await _call_progress(on_progress, "processing", 0, "waiting")

        # Step 2: Poll for completion
        # Timeout resets whenever status or progress changes, so long-running
        # transcriptions won't be killed as long as VoxHub is making progress.
        poll_url = f"{base}/v1/audio/transcriptions/jobs/{job_id}"
        stale_timeout = 300  # 5 minutes without any change = stale
        poll_interval = 3
        status = "unknown"
        last_progress = -1.0
        last_stage = None
        seconds_since_change = 0

        async with httpx.AsyncClient(timeout=30.0, verify=settings.voxhub_ssl_verify) as client:
            while seconds_since_change < stale_timeout:
                await asyncio.sleep(poll_interval)
                seconds_since_change += poll_interval

                poll_resp = await client.get(poll_url, headers=headers)
                if poll_resp.status_code != 200:
                    raise Exception(f"VoxHub poll error: {poll_resp.status_code} - {poll_resp.text}")

                status_data = poll_resp.json()
                status = status_data.get("status", "unknown")
                progress = status_data.get("progress", 0)
                stage = status_data.get("stage", None)
                logger.info("VoxHub Job %s: status=%s, progress=%.1f%%, stage=%s", job_id, status, progress, stage)

                await _call_progress(on_progress, status, progress, stage)

                # Reset stale timer on any change
                if progress != last_progress or stage != last_stage or status != "processing":
                    seconds_since_change = 0
                    last_progress = progress
                    last_stage = stage

                if status == "completed":
                    break
                elif status == "failed":
                    error_msg = status_data.get("error", "Job failed without error details")
                    raise Exception(f"VoxHub job failed: {error_msg}")
                elif status == "cancelled":
                    raise Exception("VoxHub job was cancelled")
                # Keep polling for "processing", "queued", etc.

        if status != "completed":
            raise Exception(f"VoxHub job timed out (no progress for {stale_timeout}s, status={status})")

        # Step 3: Fetch result with verbose_json to get segments & speaker labels
        result_url = f"{base}/v1/audio/transcriptions/jobs/{job_id}/result"
        async with httpx.AsyncClient(timeout=30.0, verify=settings.voxhub_ssl_verify) as client:
            result_resp = await client.get(
                result_url,
                params={"response_format": "verbose_json"},
                headers=headers,
            )

        if result_resp.status_code != 200:
            raise Exception(f"VoxHub result fetch error: {result_resp.status_code} - {result_resp.text}")

        logger.info("VoxHub Job %s: result fetched successfully", job_id)
        return result_resp.json()

    @staticmethod
    async def cancel_voxhub_job(job_id: str, db: Optional[AsyncSession] = None) -> bool:
        """Cancel a VoxHub job. Returns True if successfully cancelled."""
        cfg = await TranscriptionService._resolve_transcription_settings(db)
        headers = TranscriptionService._build_auth_headers(cfg["api_key"])
        url = f"{cfg['api_url']}/v1/audio/transcriptions/jobs/{job_id}/cancel"
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=settings.voxhub_ssl_verify) as client:
                resp = await client.post(url, headers=headers)
            if resp.status_code == 200:
                logger.info("VoxHub job %s cancelled", job_id)
                return True
            logger.warning("VoxHub cancel job %s returned %s: %s", job_id, resp.status_code, resp.text)
            return resp.status_code == 409  # Already terminal = treat as success
        except Exception as e:
            logger.error("Failed to cancel VoxHub job %s: %s", job_id, e)
            return False

    @staticmethod
    async def get_voxhub_queue_info(db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        """Get VoxHub job queue info (pending + processing counts, job list).
        Returns dict with 'counts' and 'jobs' keys."""
        cfg = await TranscriptionService._resolve_transcription_settings(db)
        if not cfg.get("job_mode"):
            return {"counts": {}, "jobs": [], "total": 0}
        headers = TranscriptionService._build_auth_headers(cfg["api_key"])
        url = f"{cfg['api_url']}/v1/audio/transcriptions/jobs"
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=settings.voxhub_ssl_verify) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            logger.warning("VoxHub jobs list returned %s", resp.status_code)
            return {"counts": {}, "jobs": [], "total": 0}
        except Exception as e:
            logger.error("Failed to fetch VoxHub jobs: %s", e)
            return {"counts": {}, "jobs": [], "total": 0}

    @staticmethod
    def parse_voxhub_response(response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse WhisperX/VoxHub response and extract transcript, segments, speakers,
        and optionally speaker_embeddings (if VoxHub returned them)."""
        text = response.get("text", "")

        # Parse segments
        segments = []
        raw_segments = response.get("segments", [])
        for seg in raw_segments:
            segments.append(
                {
                    "start": seg.get("start"),
                    "end": seg.get("end"),
                    "text": seg.get("text", ""),
                    "speaker": seg.get("speaker", None),
                }
            )

        # Extract speaker list
        speakers = {}
        for seg in segments:
            if seg.get("speaker") and seg["speaker"] not in speakers:
                speakers[seg["speaker"]] = seg["speaker"]  # Default to speaker code

        duration = response.get("duration", None)

        # Extract per-speaker embeddings if present (requires return_speaker_embeddings=true)
        speaker_embeddings = response.get("speaker_embeddings", None)

        result = {
            "text": text,
            "segments": segments,
            "speakers": speakers,
            "duration": duration,
        }
        if speaker_embeddings:
            result["speaker_embeddings"] = speaker_embeddings

        return result

    @staticmethod
    async def create_transcription(
        db: AsyncSession,
        user_id: uuid.UUID,
        file_path: str,
        stored_filename: str,
        original_filename: str,
        language: Optional[str] = None,
        on_progress: Optional[Callable[[str, float, Optional[str]], None]] = None,
    ) -> Transcription:
        """Create a transcription record and start transcription process."""
        transcription = Transcription(
            user_id=user_id,
            filename=stored_filename,
            original_filename=original_filename,
            language=language,
            status=TranscriptionStatus.processing,
        )
        db.add(transcription)
        await db.commit()
        await db.refresh(transcription)

        # Transcribe asynchronously
        try:
            voxhub_response = await TranscriptionService.transcribe_with_voxhub(
                file_path, language=language, db=db, on_progress=on_progress
            )
            parsed = TranscriptionService.parse_voxhub_response(voxhub_response)

            transcription.text = parsed["text"]
            transcription.segments = parsed["segments"]
            transcription.speakers = parsed["speakers"]
            transcription.audio_duration = parsed["duration"]
            transcription.status = TranscriptionStatus.completed

            # Speaker identification: match VoxHub speaker embeddings against known profiles
            speaker_embeddings = parsed.get("speaker_embeddings")
            if speaker_embeddings:
                try:
                    from app.services.speaker_identification import match_speakers, apply_speaker_matches
                    matches = await match_speakers(
                        db, speaker_embeddings, threshold=settings.speaker_match_threshold
                    )
                    if matches:
                        transcription.speakers = apply_speaker_matches(
                            transcription.speakers, matches
                        )
                except Exception as e:
                    logger.warning("Speaker identification failed (non-fatal): %s", e)
        except Exception as e:
            transcription.status = TranscriptionStatus.failed
            transcription.error_message = str(e)

        await db.commit()
        await db.refresh(transcription)
        return transcription

    @staticmethod
    async def get_transcription(db: AsyncSession, transcription_id: uuid.UUID) -> Optional[Transcription]:
        """Get a transcription by ID."""
        result = await db.execute(
            select(Transcription).where(Transcription.id == transcription_id)
        )
        return result.scalars().first()

    @staticmethod
    async def get_user_transcriptions(
        db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 50
    ) -> list[Transcription]:
        """Get all transcriptions for a user."""
        result = await db.execute(
            select(Transcription)
            .where(Transcription.user_id == user_id)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def update_speakers(
        db: AsyncSession, transcription_id: uuid.UUID, speakers: Dict[str, str]
    ) -> Optional[Transcription]:
        """Update speaker mappings for a transcription."""
        transcription = await TranscriptionService.get_transcription(db, transcription_id)
        if not transcription:
            return None
        transcription.speakers = speakers
        await db.commit()
        await db.refresh(transcription)
        return transcription

    @staticmethod
    async def update_notes(
        db: AsyncSession, transcription_id: uuid.UUID, notes: Optional[str]
    ) -> Optional[Transcription]:
        """Update notes for a transcription."""
        transcription = await TranscriptionService.get_transcription(db, transcription_id)
        if not transcription:
            return None
        transcription.notes = notes
        await db.commit()
        await db.refresh(transcription)
        return transcription

    @staticmethod
    async def update_title(
        db: AsyncSession, transcription_id: uuid.UUID, title: Optional[str]
    ) -> Optional[Transcription]:
        """Update title for a transcription."""
        transcription = await TranscriptionService.get_transcription(db, transcription_id)
        if not transcription:
            return None
        transcription.title = title
        await db.commit()
        await db.refresh(transcription)
        return transcription

    @staticmethod
    async def delete_transcription(db: AsyncSession, transcription_id: uuid.UUID) -> bool:
        """Delete a transcription and all related records (hard delete)."""
        transcription = await TranscriptionService.get_transcription(db, transcription_id)
        if not transcription:
            return False

        # Delete related summaries first (FK constraint)
        await db.execute(
            sa_delete(Summary).where(Summary.transcription_id == transcription_id)
        )
        # Delete related chat conversations
        await db.execute(
            sa_delete(ChatConversation).where(ChatConversation.transcription_id == transcription_id)
        )

        await db.delete(transcription)
        await db.commit()
        return True

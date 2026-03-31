import asyncio
import httpx
import json
import logging
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator, Callable
from fastapi import UploadFile
from app.config import settings
from app.models.transcription import Transcription, TranscriptionStatus
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

logger = logging.getLogger(__name__)


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
                "api_url": await get_effective_setting(db, "voxbench_api_url"),
                "api_key": await get_effective_setting(db, "voxbench_api_key"),
                "model": await get_effective_setting(db, "voxbench_model"),
                "job_mode": (await get_effective_setting(db, "voxbench_job_mode")).lower() == "true",
            }
        return {
            "api_url": settings.voxbench_api_url,
            "api_key": settings.voxbench_api_key,
            "model": settings.voxbench_model,
            "job_mode": settings.voxbench_job_mode.lower() == "true",
        }

    @staticmethod
    def _build_auth_headers(api_key: str) -> Dict[str, str]:
        """Build auth headers if an API key is configured."""
        if api_key:
            return {"Authorization": f"Bearer {api_key}"}
        return {}

    @staticmethod
    async def transcribe_with_whisperx(
        file_path: str,
        language: Optional[str] = None,
        db: Optional[AsyncSession] = None,
        on_progress: Optional[Callable[[str, float], None]] = None,
    ) -> Dict[str, Any]:
        """Call VoxBench/WhisperX API to transcribe audio file.

        Supports two modes:
        - Normal (synchronous): POST /v1/audio/transcriptions
        - Job (asynchronous): POST /v1/audio/transcriptions/jobs → poll → fetch result
        """
        cfg = await TranscriptionService._resolve_transcription_settings(db)
        headers = TranscriptionService._build_auth_headers(cfg["api_key"])

        if cfg["job_mode"]:
            return await TranscriptionService._transcribe_job_mode(
                file_path, language, cfg, headers, on_progress=on_progress
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
            data = {
                "model": cfg["model"],
                "response_format": "verbose_json",
                "diarize": "true",
            }
            if language:
                data["language"] = language

            async with httpx.AsyncClient(timeout=300.0, verify=settings.voxbench_ssl_verify) as client:
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
        on_progress: Optional[Callable[[str, float], None]] = None,
    ) -> Dict[str, Any]:
        """Async VoxBench Job Mode — submit, poll, fetch result.

        Args:
            on_progress: optional callback(status, progress_percent) called on each poll.
        """
        base = cfg["api_url"]

        # Step 1: Submit job
        submit_url = f"{base}/v1/audio/transcriptions/jobs"
        logger.info("VoxBench Job Mode: submitting job to %s", submit_url)

        if on_progress:
            on_progress("uploading", 0)

        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f, "audio/mpeg")}
            data = {
                "model": cfg["model"],
                "diarize": "true",
            }
            if language:
                data["language"] = language

            async with httpx.AsyncClient(timeout=60.0, verify=settings.voxbench_ssl_verify) as client:
                response = await client.post(submit_url, files=files, data=data, headers=headers)

        if response.status_code not in (200, 201, 202):
            raise Exception(f"VoxBench job submit error: {response.status_code} - {response.text}")

        job_data = response.json()
        job_id = job_data.get("job_id") or job_data.get("id")
        if not job_id:
            raise Exception(f"VoxBench job submit returned no job_id: {job_data}")

        logger.info("VoxBench Job Mode: job submitted, id=%s", job_id)

        if on_progress:
            on_progress("processing", 0)

        # Step 2: Poll for completion
        poll_url = f"{base}/v1/audio/transcriptions/jobs/{job_id}"
        max_wait = 600  # 10 minutes max
        elapsed = 0
        poll_interval = 3
        status = "unknown"

        async with httpx.AsyncClient(timeout=30.0, verify=settings.voxbench_ssl_verify) as client:
            while elapsed < max_wait:
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

                poll_resp = await client.get(poll_url, headers=headers)
                if poll_resp.status_code != 200:
                    raise Exception(f"VoxBench poll error: {poll_resp.status_code} - {poll_resp.text}")

                status_data = poll_resp.json()
                status = status_data.get("status", "unknown")
                progress = status_data.get("progress", 0)
                logger.info("VoxBench Job %s: status=%s, progress=%.1f%%", job_id, status, progress)

                if on_progress:
                    on_progress(status, progress)

                if status == "completed":
                    break
                elif status == "failed":
                    error_msg = status_data.get("error", "Job failed without error details")
                    raise Exception(f"VoxBench job failed: {error_msg}")
                # Keep polling for "processing", "queued", etc.

        if status != "completed":
            raise Exception(f"VoxBench job timed out after {max_wait}s (status={status})")

        # Step 3: Fetch result with verbose_json to get segments & speaker labels
        result_url = f"{base}/v1/audio/transcriptions/jobs/{job_id}/result"
        async with httpx.AsyncClient(timeout=30.0, verify=settings.voxbench_ssl_verify) as client:
            result_resp = await client.get(
                result_url,
                params={"response_format": "verbose_json"},
                headers=headers,
            )

        if result_resp.status_code != 200:
            raise Exception(f"VoxBench result fetch error: {result_resp.status_code} - {result_resp.text}")

        logger.info("VoxBench Job %s: result fetched successfully", job_id)
        return result_resp.json()

    @staticmethod
    def parse_whisperx_response(response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse WhisperX/VoxBench response and extract transcript, segments, and speakers."""
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

        return {
            "text": text,
            "segments": segments,
            "speakers": speakers,
            "duration": duration,
        }

    @staticmethod
    async def create_transcription(
        db: AsyncSession,
        user_id: uuid.UUID,
        file_path: str,
        stored_filename: str,
        original_filename: str,
        language: Optional[str] = None,
        on_progress: Optional[Callable[[str, float], None]] = None,
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
            whisperx_response = await TranscriptionService.transcribe_with_whisperx(
                file_path, language=language, db=db, on_progress=on_progress
            )
            parsed = TranscriptionService.parse_whisperx_response(whisperx_response)

            transcription.text = parsed["text"]
            transcription.segments = parsed["segments"]
            transcription.speakers = parsed["speakers"]
            transcription.audio_duration = parsed["duration"]
            transcription.status = TranscriptionStatus.completed
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
        """Delete a transcription (hard delete)."""
        transcription = await TranscriptionService.get_transcription(db, transcription_id)
        if not transcription:
            return False
        await db.delete(transcription)
        await db.commit()
        return True

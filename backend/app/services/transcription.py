import httpx
import json
import uuid
from pathlib import Path
from typing import Optional, Dict, Any
from fastapi import UploadFile
from app.config import settings
from app.models.transcription import Transcription, TranscriptionStatus
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os


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
    async def transcribe_with_whisperx(
        file_path: str,
        language: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> Dict[str, Any]:
        """Call WhisperX API to transcribe audio file."""
        # Resolve settings from DB (if available) or fall back to env
        if db:
            from app.services.settings_service import get_effective_setting
            whisperx_url_base = await get_effective_setting(db, "whisperx_api_url")
            model = await get_effective_setting(db, "whisperx_model")
        else:
            whisperx_url_base = settings.whisperx_api_url
            model = settings.whisperx_model

        whisperx_url = f"{whisperx_url_base}/v1/audio/transcriptions"

        with open(file_path, "rb") as f:
            files = {"file": (Path(file_path).name, f, "audio/mpeg")}
            data = {
                "model": model,
                "response_format": "verbose_json",
            }
            if language:
                data["language"] = language

            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(whisperx_url, files=files, data=data)

        if response.status_code != 200:
            raise Exception(f"WhisperX API error: {response.status_code} - {response.text}")

        return response.json()

    @staticmethod
    def parse_whisperx_response(response: Dict[str, Any]) -> Dict[str, Any]:
        """Parse WhisperX response and extract transcript, segments, and speakers."""
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
                file_path, language=language, db=db
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
    async def delete_transcription(db: AsyncSession, transcription_id: uuid.UUID) -> bool:
        """Delete a transcription (hard delete)."""
        transcription = await TranscriptionService.get_transcription(db, transcription_id)
        if not transcription:
            return False
        await db.delete(transcription)
        await db.commit()
        return True

import asyncio
import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from app.database import AsyncSessionLocal
from app.models.transcription import Transcription, TranscriptionStatus
from app.models.template import SummaryTemplate
from app.models.summary import Summary
from app.services.transcription import TranscriptionService
from app.services.llm import LLMService
from app.utils.date_extract import extract_meeting_date
from app.config import settings

logger = logging.getLogger(__name__)


class TranscriptionQueue:
    """In-memory queue manager backed by DB state.

    Processes one transcription at a time. Stores progress in the DB so
    any client can poll for real-time status.
    """

    def __init__(self):
        self._processing_lock = asyncio.Lock()
        self._worker_task: Optional[asyncio.Task] = None
        self._running = False
        # Event subscribers: transcription_id -> list of asyncio.Queue
        self._subscribers: Dict[uuid.UUID, List[asyncio.Queue]] = {}

    async def start(self):
        """Start the background worker."""
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())
        logger.info("Transcription queue worker started")

    async def stop(self):
        """Stop the background worker."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("Transcription queue worker stopped")

    async def enqueue(self, transcription_id: uuid.UUID) -> int:
        """Add a transcription to the queue. Returns its queue position."""
        async with AsyncSessionLocal() as db:
            # Get current max queue position
            result = await db.execute(
                select(func.max(Transcription.queue_position)).where(
                    Transcription.status.in_([TranscriptionStatus.queued, TranscriptionStatus.processing])
                )
            )
            max_pos = result.scalar() or 0
            new_pos = max_pos + 1

            # Update the transcription
            await db.execute(
                update(Transcription)
                .where(Transcription.id == transcription_id)
                .values(
                    status=TranscriptionStatus.queued,
                    queue_position=new_pos,
                    queued_at=datetime.utcnow(),
                    progress=0,
                    progress_stage=None,
                )
            )
            await db.commit()

            logger.info("Transcription %s enqueued at position %d", transcription_id, new_pos)

            # Notify subscribers
            await self._notify(transcription_id, {
                "event": "queued",
                "queue_position": new_pos,
                "status": "queued",
            })

            return new_pos

    async def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        async with AsyncSessionLocal() as db:
            # Get all queued/processing items ordered by queue_position
            result = await db.execute(
                select(Transcription)
                .where(Transcription.status.in_([
                    TranscriptionStatus.queued,
                    TranscriptionStatus.processing,
                ]))
                .order_by(Transcription.queue_position.asc())
            )
            items = result.scalars().all()

            processing = None
            queued = []
            for item in items:
                if item.status == TranscriptionStatus.processing:
                    processing = item
                else:
                    queued.append(item)

            return {
                "queue": items,
                "total_in_queue": len(items),
                "currently_processing": processing,
            }

    async def get_user_queue_items(self, user_id: uuid.UUID) -> List[Transcription]:
        """Get queue items for a specific user."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Transcription)
                .where(
                    Transcription.user_id == user_id,
                    Transcription.status.in_([
                        TranscriptionStatus.queued,
                        TranscriptionStatus.processing,
                    ])
                )
                .order_by(Transcription.queue_position.asc())
            )
            return result.scalars().all()

    def subscribe(self, transcription_id: uuid.UUID) -> asyncio.Queue:
        """Subscribe to status updates for a transcription. Returns a Queue."""
        q = asyncio.Queue()
        if transcription_id not in self._subscribers:
            self._subscribers[transcription_id] = []
        self._subscribers[transcription_id].append(q)
        return q

    def unsubscribe(self, transcription_id: uuid.UUID, q: asyncio.Queue):
        """Unsubscribe from status updates."""
        if transcription_id in self._subscribers:
            self._subscribers[transcription_id] = [
                s for s in self._subscribers[transcription_id] if s is not q
            ]
            if not self._subscribers[transcription_id]:
                del self._subscribers[transcription_id]

    async def _notify(self, transcription_id: uuid.UUID, data: Dict[str, Any]):
        """Notify all subscribers of a transcription update."""
        if transcription_id in self._subscribers:
            for q in self._subscribers[transcription_id]:
                try:
                    q.put_nowait(data)
                except asyncio.QueueFull:
                    pass  # Drop if subscriber is too slow

    async def cancel(self, transcription_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Cancel a queued or processing transcription. Returns True if cancelled."""
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Transcription).where(Transcription.id == transcription_id)
            )
            transcription = result.scalars().first()
            if not transcription:
                return False

            # Only the owner can cancel
            if transcription.user_id != user_id:
                return False

            # Only cancel if queued or processing
            if transcription.status not in (TranscriptionStatus.queued, TranscriptionStatus.processing):
                return False

            # If processing with a VoxHub job, cancel it
            if transcription.voxhub_job_id and transcription.status == TranscriptionStatus.processing:
                await TranscriptionService.cancel_voxhub_job(transcription.voxhub_job_id, db)

            transcription.status = TranscriptionStatus.cancelled
            transcription.completed_at = datetime.utcnow()
            transcription.queue_position = None

            # Delete the audio file
            file_path = Path(settings.uploads_directory) / str(transcription.user_id) / transcription.filename
            if file_path.exists() and not transcription.keep_audio:
                try:
                    os.remove(str(file_path))
                except OSError:
                    pass
                transcription.audio_available = False

            await db.commit()

        # Notify subscribers
        await self._notify(transcription_id, {
            "event": "cancelled",
            "status": "cancelled",
        })

        # Recalculate positions
        async with AsyncSessionLocal() as db:
            await self._recalculate_positions(db)

        logger.info("Transcription %s cancelled by user %s", transcription_id, user_id)
        return True

    async def _recalculate_positions(self, db: AsyncSession):
        """Recalculate queue positions after a job completes."""
        result = await db.execute(
            select(Transcription)
            .where(Transcription.status == TranscriptionStatus.queued)
            .order_by(Transcription.queue_position.asc())
        )
        items = result.scalars().all()

        for i, item in enumerate(items, 1):
            if item.queue_position != i:
                item.queue_position = i
                # Notify about position change
                await self._notify(item.id, {
                    "event": "position_update",
                    "queue_position": i,
                    "status": "queued",
                })

        await db.commit()

    async def _worker_loop(self):
        """Main worker loop - processes one transcription at a time."""
        logger.info("Queue worker loop started")
        while self._running:
            try:
                await self._process_next()
                await asyncio.sleep(2)  # Poll interval
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Queue worker error: %s", e, exc_info=True)
                await asyncio.sleep(5)  # Back off on errors

    async def _process_next(self):
        """Pick the next queued transcription and process it."""
        async with self._processing_lock:
            async with AsyncSessionLocal() as db:
                # Check if anything is already processing
                result = await db.execute(
                    select(Transcription).where(
                        Transcription.status == TranscriptionStatus.processing
                    )
                )
                if result.scalars().first():
                    return  # Already processing something

                # Get next queued item
                result = await db.execute(
                    select(Transcription)
                    .where(Transcription.status == TranscriptionStatus.queued)
                    .order_by(Transcription.queue_position.asc())
                    .limit(1)
                )
                transcription = result.scalars().first()

                if not transcription:
                    return  # Nothing to process

                # Mark as processing
                transcription.status = TranscriptionStatus.processing
                transcription.started_at = datetime.utcnow()
                transcription.queue_position = 0  # 0 = currently processing
                await db.commit()

                transcription_id = transcription.id
                user_id = transcription.user_id
                stored_filename = transcription.filename
                language = transcription.language

            # Notify: processing started
            await self._notify(transcription_id, {
                "event": "processing_started",
                "status": "processing",
                "progress": 0,
                "stage": None,
            })

            # Recalculate positions for remaining items
            async with AsyncSessionLocal() as db:
                await self._recalculate_positions(db)

            # Build file path and run transcription
            file_path = f"{settings.uploads_directory}/{user_id}/{stored_filename}"

            async def on_progress(status_str: str, progress: float, stage: str = None):
                """Update progress in DB and notify subscribers."""
                async with AsyncSessionLocal() as db:
                    await db.execute(
                        update(Transcription)
                        .where(Transcription.id == transcription_id)
                        .values(progress=progress, progress_stage=stage)
                    )
                    await db.commit()

                await self._notify(transcription_id, {
                    "event": "progress",
                    "status": status_str,
                    "progress": progress,
                    "stage": stage,
                })

            async def on_job_submitted(job_id: str):
                """Store VoxHub job_id in DB for cancellation support."""
                async with AsyncSessionLocal() as db:
                    await db.execute(
                        update(Transcription)
                        .where(Transcription.id == transcription_id)
                        .values(voxhub_job_id=job_id)
                    )
                    await db.commit()
                logger.info("Transcription %s: VoxHub job_id=%s stored", transcription_id, job_id)

            try:
                async with AsyncSessionLocal() as db:
                    voxhub_response = await TranscriptionService.transcribe_with_voxhub(
                        file_path, language=language, db=db,
                        on_progress=on_progress, on_job_submitted=on_job_submitted,
                    )

                parsed = TranscriptionService.parse_voxhub_response(voxhub_response)

                # Speaker identification: match embeddings against known voice profiles
                speaker_embeddings = parsed.get("speaker_embeddings")
                if speaker_embeddings:
                    try:
                        from app.services.speaker_identification import match_speakers, apply_speaker_matches
                        async with AsyncSessionLocal() as db:
                            matches = await match_speakers(
                                db, speaker_embeddings,
                                threshold=settings.speaker_match_threshold,
                            )
                            if matches:
                                parsed["speakers"] = apply_speaker_matches(
                                    parsed["speakers"], matches
                                )
                    except Exception as e:
                        logger.warning("Speaker identification failed (non-fatal): %s", e)

                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(Transcription).where(Transcription.id == transcription_id)
                    )
                    transcription = result.scalars().first()
                    transcription.text = parsed["text"]
                    transcription.segments = parsed["segments"]
                    transcription.speakers = parsed["speakers"]
                    transcription.audio_duration = parsed["duration"]
                    transcription.status = TranscriptionStatus.completed
                    transcription.progress = 100
                    transcription.completed_at = datetime.utcnow()
                    transcription.queue_position = None

                    # Delete audio file unless keep_audio is set
                    if not transcription.keep_audio:
                        audio_path = Path(file_path)
                        if audio_path.exists():
                            try:
                                os.remove(str(audio_path))
                                logger.info("Deleted audio file: %s", audio_path)
                            except OSError as e:
                                logger.warning("Failed to delete audio %s: %s", audio_path, e)
                        transcription.audio_available = False

                    # Capture auto-summarize settings before commit
                    should_summarize = transcription.auto_summarize
                    tpl_id = transcription.auto_summarize_template_id
                    transcript_text = transcription.text
                    orig_filename = transcription.original_filename

                    await db.commit()

                # Auto-summarize if requested and transcription produced text
                if should_summarize and tpl_id and transcript_text:
                    try:
                        async with AsyncSessionLocal() as db:
                            result = await db.execute(
                                select(SummaryTemplate).where(SummaryTemplate.id == tpl_id)
                            )
                            template = result.scalars().first()
                            if template:
                                meeting_date = extract_meeting_date(orig_filename)
                                summary_text, model_used = await LLMService.create_summary(
                                    transcript_text, template.prompt_template, db=db,
                                    meeting_date=meeting_date,
                                )
                                summary = Summary(
                                    transcription_id=transcription_id,
                                    template_id=tpl_id,
                                    content=summary_text,
                                    model_used=model_used,
                                )
                                db.add(summary)
                                await db.commit()
                                logger.info("Auto-summary created for transcription %s", transcription_id)
                    except Exception as e:
                        logger.error("Auto-summary failed for %s: %s", transcription_id, e)

                await self._notify(transcription_id, {
                    "event": "completed",
                    "status": "completed",
                    "progress": 100,
                })

                logger.info("Transcription %s completed successfully", transcription_id)

            except Exception as e:
                logger.error("Transcription %s failed: %s", transcription_id, e)
                async with AsyncSessionLocal() as db:
                    result = await db.execute(
                        select(Transcription).where(Transcription.id == transcription_id)
                    )
                    transcription = result.scalars().first()
                    if transcription:
                        # If already cancelled (by user), don't overwrite
                        if transcription.status == TranscriptionStatus.cancelled:
                            logger.info("Transcription %s was cancelled during processing", transcription_id)
                            return
                        transcription.status = TranscriptionStatus.failed
                        transcription.error_message = str(e)
                        transcription.completed_at = datetime.utcnow()
                        transcription.queue_position = None
                        await db.commit()

                await self._notify(transcription_id, {
                    "event": "failed",
                    "status": "failed",
                    "error": str(e),
                })


# Singleton instance
transcription_queue = TranscriptionQueue()

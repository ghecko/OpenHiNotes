"""Background summary generation.

Summaries are created as `pending` rows and generated here, outside the
HTTP request: a dense thinking model can take many minutes, which no
browser/proxy request should have to wait for. The queue is DB-backed (the
rows are the queue), so a restart loses nothing: rows left `processing` by a
previous run are put back to `pending` on startup.

Progress (phase, partial answer, partial reasoning) is written to the row
every couple of seconds; the frontend polls it.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Dict, Optional, Set

from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.summary import Summary, SummaryStatus
from app.models.template import SummaryTemplate
from app.models.transcription import Transcription
from app.services.llm import LLMService, LLMError, LLMProgress
from app.utils.date_extract import extract_meeting_date
from app.utils.transcript_text import build_annotated_text

logger = logging.getLogger(__name__)

PENDING = SummaryStatus.pending.value
PROCESSING = SummaryStatus.processing.value


async def _concurrency(db: AsyncSession) -> int:
    from app.services.settings_service import get_effective_setting
    raw = await get_effective_setting(db, "llm_summary_concurrency")
    try:
        return max(1, min(8, int(str(raw).strip())))
    except (TypeError, ValueError):
        return 1


class SummaryQueue:
    POLL_INTERVAL = 5.0  # s; enqueue() wakes the loop immediately anyway

    def __init__(self) -> None:
        self._tasks: Dict[uuid.UUID, asyncio.Task] = {}
        self._user_cancelled: Set[uuid.UUID] = set()
        self._wake = asyncio.Event()
        self._running = False
        self._loop_task: Optional[asyncio.Task] = None

    # ── lifecycle ─────────────────────────────────────────────────────────

    async def start(self) -> None:
        if self._running:
            return
        async with AsyncSessionLocal() as db:
            res = await db.execute(
                update(Summary)
                .where(Summary.status == PROCESSING)
                .values(status=PENDING, phase="queued", started_at=None, updated_at=datetime.utcnow())
            )
            await db.commit()
            if res.rowcount:
                logger.info("Re-queued %d summaries interrupted by a restart", res.rowcount)
        self._running = True
        self._loop_task = asyncio.create_task(self._loop())
        logger.info("Summary queue worker started")

    async def stop(self) -> None:
        self._running = False
        tasks = list(self._tasks.values())
        if self._loop_task:
            tasks.append(self._loop_task)
        for t in tasks:
            t.cancel()
        # Cancelled jobs stay `processing` in the DB and are re-queued on start.
        await asyncio.gather(*tasks, return_exceptions=True)
        logger.info("Summary queue worker stopped")

    # ── public API ────────────────────────────────────────────────────────

    def wake(self) -> None:
        self._wake.set()

    @staticmethod
    def new_pending(
        *,
        transcription_id: uuid.UUID,
        template_id: Optional[uuid.UUID] = None,
        custom_prompt: Optional[str] = None,
        reasoning_level: Optional[str] = None,
    ) -> Summary:
        """Build a pending Summary row (caller adds/commits, then calls wake())."""
        now = datetime.utcnow()
        return Summary(
            transcription_id=transcription_id,
            template_id=template_id,
            custom_prompt=custom_prompt if not template_id else None,
            reasoning_level=reasoning_level if reasoning_level and reasoning_level != "default" else None,
            content="",
            model_used="",
            status=PENDING,
            phase="queued",
            created_at=now,
            updated_at=now,
        )

    async def enqueue(self, db: AsyncSession, **kwargs) -> Summary:
        summary = self.new_pending(**kwargs)
        db.add(summary)
        await db.commit()
        await db.refresh(summary)
        self.wake()
        return summary

    def is_running(self, summary_id: uuid.UUID) -> bool:
        return summary_id in self._tasks

    def cancel(self, summary_id: uuid.UUID) -> bool:
        """Cancel an in-flight generation. Returns False if it is not running here."""
        task = self._tasks.get(summary_id)
        if not task:
            return False
        self._user_cancelled.add(summary_id)
        task.cancel()
        return True

    @staticmethod
    async def queue_positions(db: AsyncSession) -> Dict[uuid.UUID, int]:
        result = await db.execute(
            select(Summary.id).where(Summary.status == PENDING).order_by(Summary.created_at)
        )
        return {sid: i + 1 for i, sid in enumerate(result.scalars().all())}

    # ── worker ────────────────────────────────────────────────────────────

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._dispatch()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Summary queue dispatch failed")
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=self.POLL_INTERVAL)
            except asyncio.TimeoutError:
                pass
            self._wake.clear()

    async def _dispatch(self) -> None:
        claimed = []
        async with AsyncSessionLocal() as db:
            free = await _concurrency(db) - len(self._tasks)
            if free <= 0:
                return
            result = await db.execute(
                select(Summary.id).where(Summary.status == PENDING).order_by(Summary.created_at).limit(free)
            )
            now = datetime.utcnow()
            for sid in result.scalars().all():
                res = await db.execute(
                    update(Summary)
                    .where(Summary.id == sid, Summary.status == PENDING)
                    .values(status=PROCESSING, phase="waiting", started_at=now, updated_at=now)
                )
                if res.rowcount:
                    claimed.append(sid)
            await db.commit()
        for sid in claimed:
            task = asyncio.create_task(self._run(sid))
            self._tasks[sid] = task
            task.add_done_callback(lambda _t, s=sid: self._on_done(s))

    def _on_done(self, summary_id: uuid.UUID) -> None:
        self._tasks.pop(summary_id, None)
        self._user_cancelled.discard(summary_id)
        self.wake()  # a slot is free

    @staticmethod
    async def _finish(summary_id: uuid.UUID, **values) -> None:
        now = datetime.utcnow()
        values.setdefault("completed_at", now)
        values["updated_at"] = now
        values["phase"] = None
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(Summary).where(Summary.id == summary_id, Summary.status == PROCESSING).values(**values)
            )
            await db.commit()

    async def _run(self, summary_id: uuid.UUID) -> None:
        try:
            async with AsyncSessionLocal() as db:
                summary = (await db.execute(select(Summary).where(Summary.id == summary_id))).scalars().first()
                if not summary:
                    return
                transcription = (
                    await db.execute(select(Transcription).where(Transcription.id == summary.transcription_id))
                ).scalars().first()
                if not transcription or not transcription.text:
                    raise LLMError("The transcription has no text.")
                if summary.template_id:
                    template = (
                        await db.execute(select(SummaryTemplate).where(SummaryTemplate.id == summary.template_id))
                    ).scalars().first()
                    if not template:
                        raise LLMError("The template of this summary no longer exists.")
                    prompt_template = template.prompt_template
                elif summary.custom_prompt:
                    prompt_template = summary.custom_prompt
                else:
                    raise LLMError("No template or custom prompt.")
                cfg = await LLMService.resolve_settings(db)
                prompt = LLMService.build_summary_prompt(
                    build_annotated_text(transcription),
                    prompt_template,
                    extract_meeting_date(transcription.original_filename),
                )
                reasoning_level = summary.reasoning_level
                await db.execute(
                    update(Summary).where(Summary.id == summary_id).values(model_used=cfg["llm_model"] or "")
                )
                await db.commit()

            messages = [
                {"role": "system", "content": cfg["llm_system_prompt"]},
                {"role": "user", "content": prompt},
            ]

            async def on_progress(p: LLMProgress) -> None:
                async with AsyncSessionLocal() as pdb:
                    await pdb.execute(
                        update(Summary)
                        .where(Summary.id == summary_id, Summary.status == PROCESSING)
                        .values(
                            phase=p.phase,
                            content=p.answer,
                            reasoning=p.reasoning or None,
                            updated_at=datetime.utcnow(),
                        )
                    )
                    await pdb.commit()

            result = await LLMService.complete(
                messages, cfg=cfg, reasoning_level=reasoning_level, on_progress=on_progress,
            )
            await self._finish(
                summary_id,
                status=SummaryStatus.completed.value,
                content=result.content,
                reasoning=result.reasoning or None,
                model_used=result.model or cfg["llm_model"] or "",
                error_message=result.warning,
            )
            logger.info("Summary %s completed in %.0f s (model %s)", summary_id, result.elapsed, result.model)
        except asyncio.CancelledError:
            if summary_id in self._user_cancelled:
                await self._finish(
                    summary_id, status=SummaryStatus.cancelled.value, error_message="Cancelled by user."
                )
                logger.info("Summary %s cancelled by user", summary_id)
                return
            raise  # shutdown: row stays processing, re-queued on next start
        except LLMError as e:
            logger.warning("Summary %s failed: %s", summary_id, e)
            await self._finish(summary_id, status=SummaryStatus.failed.value, error_message=str(e))
        except Exception as e:
            logger.exception("Summary %s failed unexpectedly", summary_id)
            await self._finish(summary_id, status=SummaryStatus.failed.value, error_message=f"Unexpected error: {e}")


summary_queue = SummaryQueue()

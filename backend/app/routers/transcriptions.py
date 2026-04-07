import asyncio
import json
import os
import re
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Depends,
    UploadFile,
    File,
    Form,
    Query,
)
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.config import settings
from app.schemas.transcription import (
    TranscriptionResponse,
    PaginatedTranscriptionResponse,
    SpeakersUpdate,
    NotesUpdate,
    TitleUpdate,
    SegmentSpeakerReassign,
    SegmentTextUpdate,
    TranscriptFindReplace,
)
from app.models.user import User, UserRole
from app.models.transcription import Transcription, TranscriptionStatus
from app.models.summary import Summary
from app.models.template import SummaryTemplate
from app.models.resource_share import ResourceType
from app.dependencies import get_current_user
from app.services.transcription import TranscriptionService
from app.services.llm import LLMService
from app.services.permissions import PermissionService
from app.utils.date_extract import extract_meeting_date

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


async def _enrich_with_permissions(
    transcription: Transcription,
    user: User,
    db: AsyncSession,
) -> dict:
    """Add permission_level to a transcription response."""
    level = await PermissionService.get_permission_level(
        db, user, ResourceType.transcription, transcription.id
    )
    data = TranscriptionResponse.model_validate(transcription).model_dump()
    data["permission_level"] = level
    return data


@router.post("/upload", response_model=TranscriptionResponse, status_code=status.HTTP_201_CREATED)
async def upload_transcription(
    file: UploadFile = File(...),
    language: str = Form(None),
    auto_summarize: bool = Form(False),
    template_id: uuid.UUID = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio file and create transcription."""
    # Normalize language: "auto" means let VoxHub auto-detect (omit param)
    if language and language.lower() == "auto":
        language = None

    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided",
        )

    # Save file
    try:
        stored_filename, original_filename = await TranscriptionService.save_uploaded_file(
            file, current_user.id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to save file: {str(e)}",
        )

    # Create transcription
    file_path = f"{settings.uploads_directory}/{current_user.id}/{stored_filename}"
    try:
        transcription = await TranscriptionService.create_transcription(
            db,
            user_id=current_user.id,
            file_path=file_path,
            stored_filename=stored_filename,
            original_filename=original_filename,
            language=language,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to transcribe: {str(e)}",
        )

    # Auto-summarize if requested
    if auto_summarize and template_id:
        try:
            # Get template
            result = await db.execute(
                select(SummaryTemplate).where(SummaryTemplate.id == template_id)
            )
            template = result.scalars().first()

            if not template:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Template not found",
                )

            # Create summary
            if transcription.text:
                meeting_date = extract_meeting_date(transcription.original_filename)
                summary_text, model_used = await LLMService.create_summary(
                    transcription.text, template.prompt_template,
                    db=db, meeting_date=meeting_date,
                )
                summary = Summary(
                    transcription_id=transcription.id,
                    template_id=template_id,
                    content=summary_text,
                    model_used=model_used,
                )
                db.add(summary)
                await db.commit()
        except Exception as e:
            # Log error but don't fail the upload
            print(f"Auto-summarization failed: {str(e)}")

    return transcription


@router.post("/upload-stream")
async def upload_transcription_stream(
    file: UploadFile = File(...),
    language: str = Form(None),
    auto_summarize: bool = Form(False),
    template_id: uuid.UUID = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio file and transcribe with SSE progress streaming.

    Returns a text/event-stream with events:
      - {"event": "progress", "status": "uploading|processing|completed", "progress": 0-100}
      - {"event": "complete", "transcription": { ... }}
      - {"event": "error", "message": "..."}
    """
    # Normalize language: "auto" means let VoxHub auto-detect (omit param)
    if language and language.lower() == "auto":
        language = None

    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided",
        )

    # Save file
    try:
        stored_filename, original_filename = await TranscriptionService.save_uploaded_file(
            file, current_user.id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to save file: {str(e)}",
        )

    file_path = f"{settings.uploads_directory}/{current_user.id}/{stored_filename}"

    # Use an asyncio.Queue to bridge the on_progress callback → SSE generator
    progress_queue: asyncio.Queue = asyncio.Queue()

    def on_progress(status_str: str, progress: float, stage: str = None):
        progress_queue.put_nowait(("progress", status_str, progress, stage))

    async def run_transcription():
        """Run the transcription and push the result/error into the queue."""
        try:
            transcription = await TranscriptionService.create_transcription(
                db,
                user_id=current_user.id,
                file_path=file_path,
                stored_filename=stored_filename,
                original_filename=original_filename,
                language=language,
                on_progress=on_progress,
            )

            # Auto-summarize if requested
            if auto_summarize and template_id and transcription.text:
                try:
                    result = await db.execute(
                        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
                    )
                    template = result.scalars().first()
                    if template:
                        meeting_date = extract_meeting_date(transcription.original_filename)
                        summary_text, model_used = await LLMService.create_summary(
                            transcription.text, template.prompt_template,
                            db=db, meeting_date=meeting_date,
                        )
                        summary = Summary(
                            transcription_id=transcription.id,
                            template_id=template_id,
                            content=summary_text,
                            model_used=model_used,
                        )
                        db.add(summary)
                        await db.commit()
                except Exception as e:
                    print(f"Auto-summarization failed: {str(e)}")

            progress_queue.put_nowait(("complete", transcription, None))
        except Exception as e:
            progress_queue.put_nowait(("error", str(e), None))

    async def event_generator():
        """SSE generator that yields progress events then the final result."""
        # Start the transcription task in the background
        task = asyncio.create_task(run_transcription())

        try:
            while True:
                try:
                    msg = await asyncio.wait_for(progress_queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    # Send a keep-alive comment to prevent connection timeout
                    yield ": keep-alive\n\n"
                    continue

                event_type = msg[0]

                if event_type == "progress":
                    _, status_str, progress, stage = msg
                    data = json.dumps({
                        "event": "progress",
                        "status": status_str,
                        "progress": round(progress, 1),
                        "stage": stage,
                    })
                    yield f"data: {data}\n\n"

                elif event_type == "complete":
                    _, transcription, _ = msg
                    # Serialize the transcription via Pydantic
                    t_response = TranscriptionResponse.model_validate(transcription)
                    data = json.dumps({
                        "event": "complete",
                        "transcription": t_response.model_dump(mode="json"),
                        "stage": None,
                    })
                    yield f"data: {data}\n\n"
                    break

                elif event_type == "error":
                    _, error_msg, _ = msg
                    data = json.dumps({
                        "event": "error",
                        "message": error_msg,
                    })
                    yield f"data: {data}\n\n"
                    break
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("", response_model=PaginatedTranscriptionResponse)
async def list_transcriptions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort: str = Query("newest", regex="^(newest|oldest)$"),
    filter: str = Query("all", regex="^(all|mine|shared)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List transcriptions. Supports filter: all (mine + shared), mine, shared."""
    order = Transcription.created_at.desc() if sort == "newest" else Transcription.created_at.asc()

    if current_user.role == UserRole.admin:
        # Admins see everything
        query = select(Transcription).order_by(order).offset(skip).limit(limit)
        count_query = select(func.count()).select_from(Transcription)
    else:
        # Get accessible IDs
        accessible_ids = await PermissionService.list_accessible_ids(
            db, current_user, ResourceType.transcription
        )

        if filter == "mine":
            query = (
                select(Transcription)
                .where(Transcription.user_id == current_user.id)
                .order_by(order)
                .offset(skip)
                .limit(limit)
            )
            count_query = (
                select(func.count())
                .select_from(Transcription)
                .where(Transcription.user_id == current_user.id)
            )
        elif filter == "shared":
            shared_ids = [tid for tid in accessible_ids if tid not in
                          {r[0] for r in (await db.execute(
                              select(Transcription.id).where(Transcription.user_id == current_user.id)
                          ))}]
            query = (
                select(Transcription)
                .where(Transcription.id.in_(shared_ids))
                .order_by(order)
                .offset(skip)
                .limit(limit)
            )
            count_query = (
                select(func.count())
                .select_from(Transcription)
                .where(Transcription.id.in_(shared_ids))
            )
        else:  # "all" — owned + shared
            query = (
                select(Transcription)
                .where(Transcription.id.in_(accessible_ids))
                .order_by(order)
                .offset(skip)
                .limit(limit)
            )
            count_query = (
                select(func.count())
                .select_from(Transcription)
                .where(Transcription.id.in_(accessible_ids))
            )

    # Execute queries
    total = await db.scalar(count_query)
    result = await db.execute(query)
    transcriptions = result.scalars().all()

    return {
        "items": transcriptions,
        "total": total or 0,
        "skip": skip,
        "limit": limit
    }


@router.get("/by-filenames", response_model=dict)
async def check_transcriptions_by_filenames(
    filenames: str = Query(..., description="Comma-separated list of original filenames"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check which filenames have existing transcriptions. Returns a mapping of filename -> transcription info."""
    filename_list = [f.strip() for f in filenames.split(",") if f.strip()]

    query = select(
        Transcription.original_filename,
        Transcription.id,
        Transcription.status,
        Transcription.title,
        Transcription.keep_audio,
        Transcription.audio_available,
    ).where(Transcription.original_filename.in_(filename_list))

    if current_user.role != UserRole.admin:
        # Include owned + accessible transcriptions
        accessible_ids = await PermissionService.list_accessible_ids(
            db, current_user, ResourceType.transcription
        )
        query = query.where(Transcription.id.in_(accessible_ids))

    result = await db.execute(query)
    rows = result.all()

    # Build mapping: filename -> {id, status, title, keep_audio, audio_available}
    mapping: dict = {}
    for row in rows:
        fname = row[0]
        # Keep the most recent (or completed) transcription per filename
        if fname not in mapping or row[2] == "completed":
            mapping[fname] = {
                "id": str(row[1]),
                "status": row[2],
                "title": row[3],
                "keep_audio": row[4],
                "audio_available": row[5],
            }

    return mapping


@router.post("/queue", response_model=TranscriptionResponse, status_code=status.HTTP_202_ACCEPTED)
async def queue_transcription(
    file: UploadFile = File(...),
    language: str = Form(None),
    keep_audio: bool = Form(False),
    auto_summarize: bool = Form(False),
    template_id: uuid.UUID = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio file and add transcription to the background queue.
    Returns immediately with the transcription ID and queue position."""
    # Enforce admin keep_audio setting
    if keep_audio:
        from app.models.app_settings import AppSetting
        ka_result = await db.execute(
            select(AppSetting).where(AppSetting.key == "keep_audio_enabled")
        )
        ka_setting = ka_result.scalars().first()
        if ka_setting and ka_setting.value.lower() != "true":
            keep_audio = False  # silently override if admin disabled

    if language and language.lower() == "auto":
        language = None

    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    try:
        stored_filename, original_filename = await TranscriptionService.save_uploaded_file(
            file, current_user.id
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to save file: {str(e)}")

    # Create transcription record with pending status
    transcription = Transcription(
        user_id=current_user.id,
        filename=stored_filename,
        original_filename=original_filename,
        language=language,
        status=TranscriptionStatus.pending,
        keep_audio=keep_audio,
        audio_available=True,
        auto_summarize=auto_summarize,
        auto_summarize_template_id=template_id,
    )
    db.add(transcription)
    await db.commit()
    await db.refresh(transcription)

    # Enqueue it
    from app.services.queue import transcription_queue
    queue_position = await transcription_queue.enqueue(transcription.id)

    # Re-fetch to get updated fields
    await db.refresh(transcription)

    return TranscriptionResponse.model_validate(transcription)


@router.get("/queue/status")
async def get_queue_status(
    current_user: User = Depends(get_current_user),
):
    """Get the current queue status (all items being processed/waiting)."""
    from app.services.queue import transcription_queue
    status_data = await transcription_queue.get_queue_status()

    return {
        "queue": [TranscriptionResponse.model_validate(t) for t in status_data["queue"]],
        "total_in_queue": status_data["total_in_queue"],
        "currently_processing": (
            TranscriptionResponse.model_validate(status_data["currently_processing"])
            if status_data["currently_processing"] else None
        ),
    }


@router.get("/queue/my")
async def get_my_queue_items(
    current_user: User = Depends(get_current_user),
):
    """Get the current user's queued/processing transcriptions."""
    from app.services.queue import transcription_queue
    items = await transcription_queue.get_user_queue_items(current_user.id)
    return [TranscriptionResponse.model_validate(t) for t in items]


@router.get("/queue/stream/{transcription_id}")
async def stream_queue_status(
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE stream for real-time status updates of a queued transcription."""
    # Verify user owns or has access to this transcription
    transcription = await TranscriptionService.get_transcription(db, transcription_id)
    if not transcription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "read"
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    from app.services.queue import transcription_queue

    # If already completed or failed, return immediately
    if transcription.status in (TranscriptionStatus.completed, TranscriptionStatus.failed):
        async def immediate_response():
            data = json.dumps({
                "event": str(transcription.status.value),
                "status": str(transcription.status.value),
                "progress": transcription.progress or (100 if transcription.status == TranscriptionStatus.completed else 0),
                "stage": transcription.progress_stage,
            })
            yield f"data: {data}\n\n"

        return StreamingResponse(
            immediate_response(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
        )

    # Subscribe to updates
    sub_queue = transcription_queue.subscribe(transcription_id)

    async def event_generator():
        try:
            # Send current state first
            data = json.dumps({
                "event": "status",
                "status": str(transcription.status.value),
                "progress": transcription.progress or 0,
                "stage": transcription.progress_stage,
                "queue_position": transcription.queue_position,
            })
            yield f"data: {data}\n\n"

            while True:
                try:
                    msg = await asyncio.wait_for(sub_queue.get(), timeout=15.0)
                    data = json.dumps(msg)
                    yield f"data: {data}\n\n"

                    # Stop streaming after terminal events
                    if msg.get("event") in ("completed", "failed", "cancelled"):
                        break
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            transcription_queue.unsubscribe(transcription_id, sub_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/queue/cancel/{transcription_id}")
async def cancel_queued_transcription(
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
):
    """Cancel a queued or processing transcription. Users can only cancel their own jobs."""
    from app.services.queue import transcription_queue
    success = await transcription_queue.cancel(transcription_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel this transcription. It may not exist, not be yours, or already be finished."
        )
    return {"status": "cancelled", "transcription_id": str(transcription_id)}


@router.get("/queue/voxhub-info")
async def get_voxhub_queue_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get VoxHub server queue info (how many jobs are pending/processing).
    Also returns the user's current VoxHub job position if they have one."""
    from app.services.transcription import TranscriptionService

    voxhub_info = await TranscriptionService.get_voxhub_queue_info(db)

    # Find this user's active transcriptions to calculate their position
    result = await db.execute(
        select(Transcription).where(
            Transcription.user_id == current_user.id,
            Transcription.status.in_([TranscriptionStatus.queued, TranscriptionStatus.processing]),
        )
    )
    user_transcriptions = result.scalars().all()

    user_job_ids = {t.voxhub_job_id for t in user_transcriptions if t.voxhub_job_id}

    # Calculate jobs ahead of user's first job
    jobs_ahead = 0
    voxhub_jobs = voxhub_info.get("jobs", [])
    if user_job_ids and voxhub_jobs:
        # Jobs are sorted newest-first; find the user's job and count pending/processing before it
        for job in reversed(voxhub_jobs):
            if job.get("id") in user_job_ids:
                break
            if job.get("status") in ("pending", "processing"):
                jobs_ahead += 1

    counts = voxhub_info.get("counts", {})
    return {
        "pending": counts.get("pending", 0),
        "processing": counts.get("processing", 0),
        "total": voxhub_info.get("total", 0),
        "jobs_ahead": jobs_ahead,
    }


@router.get("/audio/{transcription_id}")
async def get_transcription_audio(
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve the audio file for a transcription (if kept and available)."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)
    if not transcription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "read"
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if not transcription.audio_available:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not available")

    file_path = Path(settings.uploads_directory) / str(transcription.user_id) / transcription.filename
    if not file_path.exists():
        # Mark as unavailable in DB
        transcription.audio_available = False
        await db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found on disk")

    # Determine media type from extension
    ext = file_path.suffix.lower()
    media_types = {
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
        ".ogg": "audio/ogg", ".flac": "audio/flac", ".webm": "audio/webm",
        ".hda": "application/octet-stream",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=transcription.original_filename,
    )


@router.patch("/keep-audio/{transcription_id}", response_model=TranscriptionResponse)
async def toggle_keep_audio(
    transcription_id: uuid.UUID,
    keep_audio: bool = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle the keep_audio flag for a transcription. If turning off, deletes the audio file."""
    # Enforce admin keep_audio setting when enabling
    if keep_audio:
        from app.models.app_settings import AppSetting
        ka_result = await db.execute(
            select(AppSetting).where(AppSetting.key == "keep_audio_enabled")
        )
        ka_setting = ka_result.scalars().first()
        if ka_setting and ka_setting.value.lower() != "true":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Keeping audio is disabled by administrator"
            )

    transcription = await TranscriptionService.get_transcription(db, transcription_id)
    if not transcription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    transcription.keep_audio = keep_audio

    # If turning off keep_audio on a completed transcription, delete the file
    if not keep_audio and transcription.status == TranscriptionStatus.completed:
        file_path = Path(settings.uploads_directory) / str(transcription.user_id) / transcription.filename
        if file_path.exists():
            os.remove(str(file_path))
        transcription.audio_available = False

    await db.commit()
    await db.refresh(transcription)
    return transcription


@router.get("/{transcription_id}", response_model=TranscriptionResponse)
async def get_transcription(
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single transcription."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check authorization via PermissionService
    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "read"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this transcription",
        )

    return await _enrich_with_permissions(transcription, current_user, db)


@router.patch("/{transcription_id}/speakers", response_model=TranscriptionResponse)
async def update_speakers(
    transcription_id: uuid.UUID,
    speakers_update: SpeakersUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update speaker mappings for a transcription."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check write authorization
    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    updated = await TranscriptionService.update_speakers(
        db, transcription_id, speakers_update.speakers
    )
    return updated


@router.patch("/{transcription_id}/notes", response_model=TranscriptionResponse)
async def update_notes(
    transcription_id: uuid.UUID,
    notes_update: NotesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update notes for a transcription."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check write authorization
    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    updated = await TranscriptionService.update_notes(db, transcription_id, notes_update.notes)
    return updated


@router.patch("/{transcription_id}/title", response_model=TranscriptionResponse)
async def update_title(
    transcription_id: uuid.UUID,
    title_update: TitleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update title for a transcription."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check write authorization
    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    updated = await TranscriptionService.update_title(db, transcription_id, title_update.title)
    return updated


@router.patch("/{transcription_id}/segments/reassign-speaker", response_model=TranscriptionResponse)
async def reassign_segment_speaker(
    transcription_id: uuid.UUID,
    reassign: SegmentSpeakerReassign,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reassign the speaker of specific segments to a different speaker."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    segments = list(transcription.segments or [])
    for idx in reassign.segment_indices:
        if 0 <= idx < len(segments):
            segments[idx] = {**segments[idx], "speaker": reassign.new_speaker}

    transcription.segments = segments
    await db.commit()
    await db.refresh(transcription)
    return transcription


@router.patch("/{transcription_id}/segments/update-text", response_model=TranscriptionResponse)
async def update_segment_text(
    transcription_id: uuid.UUID,
    update: SegmentTextUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the text of a specific segment (e.g. to fix a mis-transcribed word)."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    segments = list(transcription.segments or [])
    if update.segment_index < 0 or update.segment_index >= len(segments):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Segment index {update.segment_index} out of range (0-{len(segments) - 1})",
        )

    segments[update.segment_index] = {**segments[update.segment_index], "text": update.text}
    transcription.segments = segments

    # Rebuild the full text from all segments
    transcription.text = " ".join(
        seg.get("text", "").strip() for seg in segments if seg.get("text", "").strip()
    )

    await db.commit()
    await db.refresh(transcription)
    return transcription


@router.patch("/{transcription_id}/find-replace", response_model=TranscriptionResponse)
async def find_and_replace(
    transcription_id: uuid.UUID,
    payload: TranscriptFindReplace,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find and replace a word or pattern across all segments of a transcription."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    if not payload.find:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search term cannot be empty",
        )

    segments = list(transcription.segments or [])
    total_replacements = 0

    for i, seg in enumerate(segments):
        text = seg.get("text", "")
        if payload.case_sensitive:
            count = text.count(payload.find)
            new_text = text.replace(payload.find, payload.replace)
        else:
            # Case-insensitive replace
            pattern = re.compile(re.escape(payload.find), re.IGNORECASE)
            matches = pattern.findall(text)
            count = len(matches)
            new_text = pattern.sub(payload.replace, text)

        if count > 0:
            segments[i] = {**seg, "text": new_text}
            total_replacements += count

    if total_replacements == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No occurrences of '{payload.find}' found in the transcript",
        )

    transcription.segments = segments

    # Rebuild the full text from all segments
    transcription.text = " ".join(
        seg.get("text", "").strip() for seg in segments if seg.get("text", "").strip()
    )

    await db.commit()
    await db.refresh(transcription)
    return transcription


@router.delete("/{transcription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transcription(
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a transcription. Only owners and admins can delete."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Only owners and admins can delete
    level = await PermissionService.get_permission_level(
        db, current_user, ResourceType.transcription, transcription_id
    )
    if level != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can delete transcriptions",
        )

    await TranscriptionService.delete_transcription(db, transcription_id)

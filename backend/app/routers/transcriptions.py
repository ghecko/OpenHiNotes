import asyncio
import json
import uuid

from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Depends,
    UploadFile,
    File,
    Query,
)
from fastapi.responses import StreamingResponse
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
)
from app.models.user import User, UserRole
from app.models.transcription import Transcription
from app.models.summary import Summary
from app.models.template import SummaryTemplate
from app.dependencies import get_current_user
from app.services.transcription import TranscriptionService
from app.services.llm import LLMService

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


@router.post("/upload", response_model=TranscriptionResponse, status_code=status.HTTP_201_CREATED)
async def upload_transcription(
    file: UploadFile = File(...),
    language: str = Query(None),
    auto_summarize: bool = Query(False),
    template_id: uuid.UUID = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio file and create transcription."""
    # Normalize language: "auto" means let VoxBench auto-detect (omit param)
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
                summary_text, model_used = await LLMService.create_summary(
                    transcription.text, template.prompt_template
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
    language: str = Query(None),
    auto_summarize: bool = Query(False),
    template_id: uuid.UUID = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio file and transcribe with SSE progress streaming.

    Returns a text/event-stream with events:
      - {"event": "progress", "status": "uploading|processing|completed", "progress": 0-100}
      - {"event": "complete", "transcription": { ... }}
      - {"event": "error", "message": "..."}
    """
    # Normalize language: "auto" means let VoxBench auto-detect (omit param)
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

    def on_progress(status_str: str, progress: float):
        progress_queue.put_nowait(("progress", status_str, progress))

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
                        summary_text, model_used = await LLMService.create_summary(
                            transcription.text, template.prompt_template
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
                    _, status_str, progress = msg
                    data = json.dumps({
                        "event": "progress",
                        "status": status_str,
                        "progress": round(progress, 1),
                    })
                    yield f"data: {data}\n\n"

                elif event_type == "complete":
                    _, transcription, _ = msg
                    # Serialize the transcription via Pydantic
                    t_response = TranscriptionResponse.model_validate(transcription)
                    data = json.dumps({
                        "event": "complete",
                        "transcription": t_response.model_dump(mode="json"),
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
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List transcriptions."""
    # Base queries
    query = select(Transcription).offset(skip).limit(limit)
    count_query = select(func.count()).select_from(Transcription)

    if current_user.role != UserRole.admin:
        # User sees only their own
        query = query.where(Transcription.user_id == current_user.id)
        count_query = count_query.where(Transcription.user_id == current_user.id)

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
    ).where(Transcription.original_filename.in_(filename_list))

    if current_user.role != UserRole.admin:
        query = query.where(Transcription.user_id == current_user.id)

    result = await db.execute(query)
    rows = result.all()

    # Build mapping: filename -> {id, status, title}
    mapping: dict = {}
    for row in rows:
        fname = row[0]
        # Keep the most recent (or completed) transcription per filename
        if fname not in mapping or row[2] == "completed":
            mapping[fname] = {
                "id": str(row[1]),
                "status": row[2],
                "title": row[3],
            }

    return mapping


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

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this transcription",
        )

    return transcription


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

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
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

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
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

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this transcription",
        )

    updated = await TranscriptionService.update_title(db, transcription_id, title_update.title)
    return updated


@router.delete("/{transcription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transcription(
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a transcription."""
    transcription = await TranscriptionService.get_transcription(db, transcription_id)

    if not transcription:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcription not found",
        )

    # Check authorization
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this transcription",
        )

    await TranscriptionService.delete_transcription(db, transcription_id)

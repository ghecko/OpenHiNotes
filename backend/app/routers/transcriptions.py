from fastapi import (
    APIRouter,
    HTTPException,
    status,
    Depends,
    UploadFile,
    File,
    Query,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.config import settings
from app.schemas.transcription import (
    TranscriptionResponse,
    PaginatedTranscriptionResponse,
    SpeakersUpdate,
    NotesUpdate,
)
from app.models.user import User, UserRole
from app.models.transcription import Transcription
from app.models.summary import Summary
from app.models.template import SummaryTemplate
from app.dependencies import get_current_user
from app.services.transcription import TranscriptionService
from app.services.llm import LLMService
import uuid

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

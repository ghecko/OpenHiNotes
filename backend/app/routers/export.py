"""Export router — GET /api/transcriptions/{id}/export?format=txt|srt|vtt|md|docx"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_user
from app.models.transcription import Transcription
from app.models.summary import Summary
from app.models.user import User, UserRole
from app.models.resource_share import ResourceType
from app.services.permissions import PermissionService

router = APIRouter(tags=["export"])

CONTENT_TYPES = {
    "txt":  "text/plain; charset=utf-8",
    "srt":  "text/plain; charset=utf-8",
    "vtt":  "text/vtt; charset=utf-8",
    "md":   "text/markdown; charset=utf-8",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.get("/transcriptions/{transcription_id}/export")
async def export_transcription(
    transcription_id: uuid.UUID,
    format: str = Query(..., regex="^(txt|srt|vtt|md|docx)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a transcription in the requested format.

    Formats:
    - txt   — plain text with speaker labels and timestamps
    - srt   — SubRip subtitles
    - vtt   — WebVTT subtitles
    - md    — Markdown document (includes summaries)
    - docx  — Microsoft Word document (includes summaries)
    """
    # Load transcription
    result = await db.execute(
        select(Transcription).where(Transcription.id == transcription_id)
    )
    transcription = result.scalars().first()
    if not transcription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")

    # Access check — owner and admin always allowed; others need at least read share
    if transcription.user_id != current_user.id and current_user.role != UserRole.admin:
        has_access = await PermissionService.check_access(
            db, current_user, ResourceType.transcription, transcription_id, required="read"
        )
        if not has_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if transcription.status.value != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transcription is not yet complete",
        )

    # Load summaries for rich formats
    summaries = []
    if format in ("md", "docx"):
        s_result = await db.execute(
            select(Summary)
            .where(Summary.transcription_id == transcription_id)
            .order_by(Summary.created_at.asc())
        )
        summaries = s_result.scalars().all()

    # Generate export bytes
    from app.services.export import export_txt, export_srt, export_vtt, export_md, export_docx

    if format == "txt":
        data = export_txt(transcription)
    elif format == "srt":
        data = export_srt(transcription)
    elif format == "vtt":
        data = export_vtt(transcription)
    elif format == "md":
        data = export_md(transcription, summaries)
    else:  # docx
        data = export_docx(transcription, summaries)

    # Build safe download filename
    raw_name = transcription.title or transcription.original_filename or str(transcription_id)
    safe_name = "".join(c if c.isalnum() or c in "-_ ." else "_" for c in raw_name).rstrip(".")
    filename = f"{safe_name}.{format}"

    return Response(
        content=data,
        media_type=CONTENT_TYPES[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

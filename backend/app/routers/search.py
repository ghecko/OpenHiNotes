"""Full-text search across the current user's accessible transcriptions.

Backed by the GIN expression index created in migration 025. The query
uses ``plainto_tsquery`` for forgiving input (handles spaces / extra
punctuation), ``ts_rank`` for ordering, and ``ts_headline`` for a
highlighted snippet with ``<mark>`` tags.

Permission-aware: relies on :class:`PermissionService.list_accessible_ids`
so users can only search content they're allowed to read.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, literal_column, text as sa_text, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.transcription import Transcription, TranscriptionStatus
from app.models.transcription_pin import transcription_pins
from app.models.user import User, UserRole
from app.models.resource_share import ResourceType
from app.schemas.search import SearchHit, SearchResponse
from app.services.permissions import PermissionService


router = APIRouter(prefix="/search", tags=["search"])


@router.get("/transcriptions", response_model=SearchResponse)
async def search_transcriptions(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    recording_type: Optional[str] = Query(
        None, regex="^(record|whisper)$",
        description="Restrict to a single recording type",
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full-text search across title + transcript body.

    Returns ranked hits with highlighted snippets. Only completed
    transcriptions are searched — pending/queued/processing items have
    no text yet, and failed ones are noise.
    """
    query_term = q.strip()
    if not query_term:
        return SearchResponse(items=[], total=0, query=q)

    # ``simple`` dictionary matches the index — keep consistent.
    tsquery = func.plainto_tsquery("simple", query_term)
    tsvector = func.to_tsvector(
        "simple",
        func.coalesce(Transcription.title, "")
        + literal_column("' '")
        + func.coalesce(Transcription.text, ""),
    )
    rank_expr = func.ts_rank(tsvector, tsquery).label("rank")
    headline_expr = func.ts_headline(
        "simple",
        func.coalesce(Transcription.text, ""),
        tsquery,
        # Keep snippets short; <mark> renders well in the existing UI.
        "StartSel=<mark>, StopSel=</mark>, MaxFragments=2, "
        "MinWords=5, MaxWords=18, FragmentDelimiter= … ",
    ).label("snippet")

    base_filters = [
        tsvector.op("@@")(tsquery),
        Transcription.status == TranscriptionStatus.completed,
    ]
    if recording_type:
        base_filters.append(Transcription.recording_type == recording_type)

    # Permission scope. Admins skip the filter entirely.
    if current_user.role != UserRole.admin:
        accessible_ids = await PermissionService.list_accessible_ids(
            db, current_user, ResourceType.transcription
        )
        if not accessible_ids:
            return SearchResponse(items=[], total=0, query=query_term)
        base_filters.append(Transcription.id.in_(accessible_ids))

    where_clause = and_(*base_filters)

    # --- total count ---------------------------------------------------
    total_q = select(func.count()).select_from(Transcription).where(where_clause)
    total = (await db.execute(total_q)).scalar() or 0

    # --- page of hits --------------------------------------------------
    # Per-user pin lookup: a transcription is "pinned" for ordering /
    # response purposes only if THIS user has pinned it.
    user_pin_ids = (
        select(transcription_pins.c.transcription_id)
        .where(transcription_pins.c.user_id == current_user.id)
    )
    is_pinned_expr = Transcription.id.in_(user_pin_ids)

    rows_q = (
        select(
            Transcription.id,
            Transcription.title,
            Transcription.original_filename,
            Transcription.recording_type,
            Transcription.status,
            is_pinned_expr.label("is_pinned"),
            Transcription.created_at,
            rank_expr,
            headline_expr,
        )
        .where(where_clause)
        # Pinned first, then rank, then newest — gives consistent ordering
        # when multiple hits tie on rank.
        .order_by(
            is_pinned_expr.desc(),
            rank_expr.desc(),
            Transcription.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    rows = (await db.execute(rows_q)).all()

    items = [
        SearchHit(
            transcription_id=row[0],
            title=row[1],
            original_filename=row[2],
            recording_type=str(row[3].value) if hasattr(row[3], "value") else str(row[3]),
            status=str(row[4].value) if hasattr(row[4], "value") else str(row[4]),
            is_pinned=bool(row[5]),
            created_at=row[6],
            rank=float(row[7] or 0.0),
            snippet=row[8],
        )
        for row in rows
    ]

    return SearchResponse(items=items, total=int(total), query=query_term)

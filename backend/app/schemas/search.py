"""Schemas for the full-text search endpoint (Phase 6.1)."""

from typing import List, Optional
import uuid
from datetime import datetime

from pydantic import BaseModel


class SearchHit(BaseModel):
    """A single search result.

    ``snippet`` is HTML-safe (already escaped by Postgres ``ts_headline``)
    with ``<mark>`` tags around matched terms.
    """

    transcription_id: uuid.UUID
    title: Optional[str] = None
    original_filename: str
    recording_type: str
    status: str
    snippet: Optional[str] = None
    rank: float
    is_pinned: bool = False
    created_at: datetime


class SearchResponse(BaseModel):
    items: List[SearchHit]
    total: int
    query: str


class BatchIdsRequest(BaseModel):
    """Generic batch request — used for delete/pin/move/share."""

    ids: List[uuid.UUID]


class BatchPinRequest(BatchIdsRequest):
    pinned: bool = True


class BatchCollectionRequest(BatchIdsRequest):
    # ``None`` removes the items from any collection.
    collection_id: Optional[uuid.UUID] = None


class BatchShareRequest(BatchIdsRequest):
    group_id: uuid.UUID
    permission: str = "read"  # "read" | "write"


class BatchResultResponse(BaseModel):
    affected: int
    skipped: int = 0
    message: Optional[str] = None


class NotificationPreferences(BaseModel):
    notify_on_completion: bool = True
    notify_email_on_completion: bool = False

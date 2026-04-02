from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class CollectionCreate(BaseModel):
    """Schema for creating a collection."""
    name: str
    color: Optional[str] = None
    description: Optional[str] = None


class CollectionUpdate(BaseModel):
    """Schema for updating a collection."""
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None


class CollectionResponse(BaseModel):
    """Schema for collection response."""
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    color: Optional[str] = None
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    transcription_count: int = 0
    # Access control fields (populated by routers, not from DB)
    permission_level: Optional[str] = None  # "owner" | "write" | "read"
    shared_by: Optional[str] = None  # display name of who shared it

    model_config = {"from_attributes": True}


class CollectionWithTranscriptions(CollectionResponse):
    """Collection with its transcription list (used for detail view)."""
    pass


class AssignCollectionRequest(BaseModel):
    """Schema for assigning a transcription to a collection."""
    collection_id: Optional[uuid.UUID] = None  # None to remove from collection

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid


class CollectionCreate(BaseModel):
    """Schema for creating a collection."""
    name: str
    description: Optional[str] = None


class CollectionUpdate(BaseModel):
    """Schema for updating a collection."""
    name: Optional[str] = None
    description: Optional[str] = None


class CollectionResponse(BaseModel):
    """Schema for collection response."""
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    transcription_count: int = 0

    model_config = {"from_attributes": True}


class CollectionWithTranscriptions(CollectionResponse):
    """Collection with its transcription list (used for detail view)."""
    pass


class AssignCollectionRequest(BaseModel):
    """Schema for assigning a transcription to a collection."""
    collection_id: Optional[uuid.UUID] = None  # None to remove from collection

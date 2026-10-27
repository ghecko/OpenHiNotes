from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid


class GlossaryTermCreate(BaseModel):
    """Add a term (or merge aliases into an existing one with the same spelling)."""
    term: str = Field(min_length=1, max_length=255)
    aliases: list[str] = Field(default_factory=list, max_length=50)
    # None = the user's general vocabulary
    collection_id: Optional[uuid.UUID] = None


class GlossaryTermUpdate(BaseModel):
    term: Optional[str] = Field(default=None, min_length=1, max_length=255)
    aliases: Optional[list[str]] = Field(default=None, max_length=50)


class GlossaryTermResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    collection_id: Optional[uuid.UUID]
    term: str
    aliases: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid


class ShareCreate(BaseModel):
    """Schema for creating a resource share."""
    resource_type: str  # "transcription" | "collection"
    resource_id: uuid.UUID
    grantee_type: str  # "user" | "group"
    grantee_id: uuid.UUID
    permission: str = "read"  # "read" | "write"


class ShareUpdate(BaseModel):
    """Schema for updating a share's permission level."""
    permission: str  # "read" | "write"


class ShareGranteeInfo(BaseModel):
    """Info about who the resource is shared with."""
    id: uuid.UUID
    name: str  # display_name for users, group name for groups
    email: Optional[str] = None  # only for users
    type: str  # "user" | "group"


class ShareResponse(BaseModel):
    """Schema for share response."""
    id: uuid.UUID
    resource_type: str
    resource_id: uuid.UUID
    grantee_type: str
    grantee_id: uuid.UUID
    permission: str
    granted_by: uuid.UUID
    created_at: datetime
    grantee: Optional[ShareGranteeInfo] = None

    class Config:
        from_attributes = True


class SharedWithMeItem(BaseModel):
    """Item in the 'shared with me' list."""
    resource_type: str
    resource_id: uuid.UUID
    resource_name: str
    permission: str
    shared_by_name: str
    shared_at: datetime

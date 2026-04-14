from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
from app.schemas.user import UserResponse


class GroupCreate(BaseModel):
    """Schema for creating a user group."""
    name: str
    description: Optional[str] = None
    sharing_policy: Optional[str] = None  # "creator_only" | "members_allowed" (default: creator_only)


class GroupUpdate(BaseModel):
    """Schema for updating a user group."""
    name: Optional[str] = None
    description: Optional[str] = None
    sharing_policy: Optional[str] = None  # "creator_only" | "members_allowed"


class GroupMemberAdd(BaseModel):
    """Schema for adding a member to a group."""
    user_id: uuid.UUID


class GroupMemberResponse(BaseModel):
    """Schema for a group member."""
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    role: str

    class Config:
        from_attributes = True


class GroupResponse(BaseModel):
    """Schema for group response."""
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    created_by: uuid.UUID
    owner_id: uuid.UUID
    sharing_policy: str = "creator_only"
    created_at: datetime
    updated_at: datetime
    member_count: int = 0
    is_owner: bool = False   # populated per-request, not from DB

    class Config:
        from_attributes = True


class GroupDetailResponse(GroupResponse):
    """Schema for group detail response with members."""
    members: List[GroupMemberResponse] = []

from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime


class SummaryTemplateCreate(BaseModel):
    """Schema for creating a summary template."""
    name: str
    description: Optional[str] = None
    prompt_template: str
    category: Optional[str] = None
    target_type: str = "both"  # "record" | "whisper" | "both"
    is_active: bool = True


class SummaryTemplateUpdate(BaseModel):
    """Schema for updating a summary template."""
    name: Optional[str] = None
    description: Optional[str] = None
    prompt_template: Optional[str] = None
    category: Optional[str] = None
    target_type: Optional[str] = None
    is_active: Optional[bool] = None


class SummaryTemplateResponse(BaseModel):
    """Schema for summary template response."""
    id: uuid.UUID
    name: str
    description: Optional[str] = None
    prompt_template: str
    category: Optional[str] = None
    target_type: str = "both"
    created_by: uuid.UUID
    is_active: bool
    is_default: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
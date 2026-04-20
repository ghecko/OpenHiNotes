from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime


class NotificationResponse(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationCountResponse(BaseModel):
    total: int
    unread: int

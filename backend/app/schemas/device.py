from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class DeviceFilesUpdate(BaseModel):
    """The file list a connected device just returned."""
    model: Optional[str] = Field(None, max_length=32)
    filenames: List[str] = Field(default_factory=list, max_length=20000)


class DeviceRename(BaseModel):
    """Name a device; an empty name removes it. ``model`` lets a device that
    was never listed be named (the row is created)."""
    name: Optional[str] = Field(None, max_length=60)
    model: Optional[str] = Field(None, max_length=32)


class UserDeviceResponse(BaseModel):
    serial: str
    model: Optional[str] = None
    name: Optional[str] = None
    file_names: List[str] = []
    files_seen_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DeviceFilesResult(BaseModel):
    devices: List[UserDeviceResponse]
    # Transcriptions without a known origin that were found on this device
    claimed: int = 0

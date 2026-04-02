from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid
from datetime import datetime


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class AdminUserCreate(BaseModel):
    """Schema for admin-created user accounts."""
    email: EmailStr
    password: str
    display_name: Optional[str] = None
    role: Optional[str] = "user"


class UserUpdate(BaseModel):
    """Schema for updating user information."""
    display_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    """Schema for user response."""
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    role: str
    is_active: bool
    status: str = "active"
    registration_source: str = "self_registered"
    created_at: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    """Schema for login request."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Schema for login response."""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RegisterResponse(BaseModel):
    """Schema for registration response — may include pending status message."""
    user: UserResponse
    message: Optional[str] = None


class RegistrationSettingsResponse(BaseModel):
    """Public-facing registration settings (no auth required)."""
    registration_enabled: bool
    approval_required: bool
    allowed_domains: list[str]

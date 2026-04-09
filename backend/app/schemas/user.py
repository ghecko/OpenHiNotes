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
    """Schema for updating user information (admin)."""
    email: Optional[EmailStr] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None
    password: Optional[str] = None
    force_password_reset: Optional[bool] = None


class UserResponse(BaseModel):
    """Schema for user response."""
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    role: str
    is_active: bool
    status: str = "active"
    registration_source: str = "self_registered"
    force_password_reset: bool = False
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
    force_password_reset: bool = False


class ChangePasswordRequest(BaseModel):
    """Schema for changing password (when force_password_reset is true)."""
    current_password: str
    new_password: str


class PasswordResetRequest(BaseModel):
    """Schema for requesting a password reset (self-service via email)."""
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Schema for confirming a password reset with a token."""
    token: str
    new_password: str


class ResetTokenResponse(BaseModel):
    """Response when admin generates a reset token."""
    reset_token: str
    reset_link: str
    expires_in_hours: int = 24


class RegisterResponse(BaseModel):
    """Schema for registration response — may include pending status message."""
    user: UserResponse
    message: Optional[str] = None


class RegistrationSettingsResponse(BaseModel):
    """Public-facing registration settings (no auth required)."""
    registration_enabled: bool
    approval_required: bool
    allowed_domains: list[str]


class EmailSettingsUpdate(BaseModel):
    """Schema for updating email/SMTP settings."""
    smtp_host: Optional[str] = None
    smtp_port: Optional[str] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[str] = None


class EmailSettingsResponse(BaseModel):
    """Response for email/SMTP settings."""
    smtp_host: str = ""
    smtp_port: str = "587"
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "OpenHiNotes"
    smtp_use_tls: str = "true"
    is_configured: bool = False

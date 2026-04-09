from fastapi import APIRouter, HTTPException, status, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.user import (
    UserCreate, LoginRequest, LoginResponse, UserResponse,
    RegisterResponse, RegistrationSettingsResponse,
    ChangePasswordRequest, PasswordResetRequest, PasswordResetConfirm,
)
from app.services.auth import AuthService
from app.services.registration import RegistrationSettingsService
from app.services.email import EmailService, EmailSettingsService
from app.models.user import User, UserStatus, RegistrationSource
from app.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/registration-settings", response_model=RegistrationSettingsResponse)
async def get_registration_settings(
    db: AsyncSession = Depends(get_db),
):
    """Get public registration settings (no auth required).
    Used by the frontend to decide whether to show the registration form."""
    data = await RegistrationSettingsService.get_all(db)
    return RegistrationSettingsResponse(**data)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_create: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user. Respects registration settings:
    - If registration is disabled, returns 403
    - If domain whitelisting is active, validates email domain
    - If approval is required, creates user with 'pending' status
    """
    # 1. Check if registration is enabled
    if not await RegistrationSettingsService.is_registration_enabled(db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is currently disabled. Contact an administrator.",
        )

    # 2. Check domain whitelist
    allowed_domains = await RegistrationSettingsService.get_allowed_domains(db)
    if not RegistrationSettingsService.validate_email_domain(user_create.email, allowed_domains):
        domain = user_create.email.rsplit("@", 1)[-1]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Registration is restricted to specific email domains. '{domain}' is not allowed.",
        )

    # 3. Check if user already exists
    existing_user = await AuthService.get_user_by_email(db, user_create.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # 4. Determine status based on approval setting
    approval_required = await RegistrationSettingsService.is_approval_required(db)
    user_status = UserStatus.pending if approval_required else UserStatus.active

    # 5. Create user
    user = await AuthService.create_user(
        db,
        email=user_create.email,
        password=user_create.password,
        display_name=user_create.display_name,
        status=user_status,
        registration_source=RegistrationSource.self_registered,
    )

    message = None
    if approval_required:
        message = "Your account has been created and is pending admin approval. You will be able to log in once approved."

    return RegisterResponse(user=UserResponse.model_validate(user), message=message)


@router.post("/login", response_model=LoginResponse)
async def login(
    login_request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login user and return JWT access token.
    If force_password_reset is set, returns a limited token with force_password_reset=true."""
    user = await AuthService.authenticate_user(db, login_request.email, login_request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        # Give a more specific message based on status
        if user.status == UserStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is pending admin approval. Please wait for an administrator to approve your registration.",
            )
        elif user.status == UserStatus.rejected:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your registration request has been rejected. Contact an administrator for more information.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated. Contact an administrator.",
            )

    # Create access token
    access_token = AuthService.create_access_token(user.id, user.email, user.role.value)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
        "force_password_reset": user.force_password_reset,
    }


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Get current user information."""
    return current_user


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for the current user. Used when force_password_reset is true,
    or when a user wants to change their password voluntarily."""
    # Verify current password
    if not AuthService.verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters",
        )

    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    await AuthService.change_password(db, current_user, body.new_password)
    return {"message": "Password changed successfully"}


@router.get("/email-configured")
async def check_email_configured(
    db: AsyncSession = Depends(get_db),
):
    """Check if email/SMTP is configured (public endpoint, no auth).
    Used by the frontend to show 'forgot password' link vs 'contact admin' message."""
    configured = await EmailSettingsService.is_configured(db)
    return {"email_configured": configured}


@router.post("/request-password-reset")
async def request_password_reset(
    body: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Request a password reset. If email is configured, sends a reset email.
    Always returns 200 to prevent email enumeration."""
    # Check if email gateway is configured
    email_configured = await EmailSettingsService.is_configured(db)

    if not email_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email is not configured. Please contact your administrator to reset your password.",
        )

    user = await AuthService.get_user_by_email(db, body.email)
    if user and user.is_active:
        # Generate reset token
        token = await AuthService.create_password_reset_token(db, user)

        # Build reset link
        base_url = str(request.base_url).rstrip("/")
        # Use the frontend URL (Origin header or Referer)
        origin = request.headers.get("origin", "")
        if origin:
            reset_link = f"{origin}/reset-password?token={token}"
        else:
            reset_link = f"{base_url}/reset-password?token={token}"

        await EmailService.send_password_reset_email(
            db, user.email, reset_link, user.display_name
        )

    # Always return success to prevent email enumeration
    return {"message": "If an account with that email exists, a password reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    """Reset password using a valid reset token."""
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )

    user = await AuthService.reset_password_with_token(db, body.token, body.new_password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    return {"message": "Password has been reset successfully. You can now log in with your new password."}

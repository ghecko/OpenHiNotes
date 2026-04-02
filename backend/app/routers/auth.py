from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.user import (
    UserCreate, LoginRequest, LoginResponse, UserResponse,
    RegisterResponse, RegistrationSettingsResponse,
)
from app.services.auth import AuthService
from app.services.registration import RegistrationSettingsService
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
    """Login user and return JWT access token."""
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
    }


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
):
    """Get current user information."""
    return current_user

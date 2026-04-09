from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from app.database import get_db
from app.schemas.user import UserResponse, UserUpdate, AdminUserCreate
from app.models.user import User, UserRole, UserStatus, RegistrationSource
from app.services.auth import AuthService
from app.dependencies import get_current_user, require_admin
import uuid

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 50,
    status_filter: str = Query("all", alias="status"),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all users (admin only). Supports status filter: all, active, pending, rejected."""
    query = select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    if status_filter == "pending":
        query = query.where(User.status == UserStatus.pending)
    elif status_filter == "active":
        query = query.where(User.status == UserStatus.active, User.is_active == True)  # noqa: E712
    elif status_filter == "rejected":
        query = query.where(User.status == UserStatus.rejected)
    result = await db.execute(query)
    users = result.scalars().all()
    return users


@router.get("/pending-count")
async def pending_count(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get count of users with pending status (admin only)."""
    result = await db.execute(
        select(func.count()).select_from(User).where(User.status == UserStatus.pending)
    )
    count = result.scalar() or 0
    return {"count": count}


@router.get("/search", response_model=list[UserResponse])
async def search_users(
    q: str = Query("", min_length=0, max_length=100),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Search users by email or display name. Available to all authenticated users (for sharing)."""
    query = select(User).where(User.is_active == True).limit(limit)  # noqa: E712
    if q:
        query = query.where(
            or_(
                User.email.ilike(f"%{q}%"),
                User.display_name.ilike(f"%{q}%"),
            )
        )
    # Exclude the current user from results
    query = query.where(User.id != current_user.id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: AdminUserCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a user account directly (admin only). Bypasses registration restrictions."""
    # Check existing
    existing = await AuthService.get_user_by_email(db, body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    role = UserRole.user
    if body.role:
        try:
            role = UserRole(body.role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role. Must be one of: {', '.join(r.value for r in UserRole)}",
            )

    user = await AuthService.create_user(
        db,
        email=body.email,
        password=body.password,
        display_name=body.display_name,
        role=role,
        status=UserStatus.active,
        registration_source=RegistrationSource.admin_created,
    )
    return user


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a user by ID."""
    if current_user.id != user_id and current_user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this user",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    user_update: UserUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user role, display_name, or is_active (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_update.role is not None:
        try:
            user.role = UserRole(user_update.role)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role. Must be one of: {', '.join(r.value for r in UserRole)}",
            )

    if user_update.display_name is not None:
        user.display_name = user_update.display_name

    if user_update.is_active is not None:
        user.is_active = user_update.is_active
        # GDPR: delete voice profiles when deactivating a user
        if not user_update.is_active:
            from app.services.speaker_identification import delete_all_user_profiles
            count = await delete_all_user_profiles(db, user_id)
            if count:
                import logging
                logging.getLogger(__name__).info(
                    "Deleted %d voice profile(s) for deactivated user %s", count, user_id
                )

    await db.commit()
    await db.refresh(user)
    return user


# Keep backward-compat route alias
@router.patch("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: uuid.UUID,
    user_update: UserUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user role (admin only) — legacy alias, use PATCH /{user_id} instead."""
    return await update_user(user_id, user_update, current_user, db)


@router.post("/{user_id}/approve", response_model=UserResponse)
async def approve_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending user registration (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.status != UserStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is not in pending state (current: {user.status.value})",
        )

    user.status = UserStatus.active
    user.is_active = True
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/{user_id}/reject", response_model=UserResponse)
async def reject_user(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending user registration (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.status != UserStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User is not in pending state (current: {user.status.value})",
        )

    user.status = UserStatus.rejected
    user.is_active = False
    # GDPR: delete voice profiles when rejecting a user
    from app.services.speaker_identification import delete_all_user_profiles
    await delete_all_user_profiles(db, user_id)
    await db.commit()
    await db.refresh(user)
    return user

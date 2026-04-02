import uuid
from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.schemas.resource_share import (
    ShareCreate,
    ShareUpdate,
    ShareResponse,
    ShareGranteeInfo,
    SharedWithMeItem,
)
from app.models.user import User, UserRole
from app.models.user_group import UserGroup, user_group_members
from app.models.transcription import Transcription
from app.models.collection import Collection
from app.models.resource_share import (
    ResourceShare,
    ResourceType,
    GranteeType,
    PermissionLevel,
)
from app.dependencies import get_current_user
from app.services.permissions import PermissionService

router = APIRouter(prefix="/shares", tags=["shares"])


@router.post("", response_model=ShareResponse, status_code=status.HTTP_201_CREATED)
async def create_share(
    share_create: ShareCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Share a resource with a user or group. Only owners/admins can share."""
    # Validate enums
    try:
        resource_type = ResourceType(share_create.resource_type)
        grantee_type = GranteeType(share_create.grantee_type)
        permission = PermissionLevel(share_create.permission)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Verify the user has owner-level access to share
    level = await PermissionService.get_permission_level(
        db, current_user, resource_type, share_create.resource_id
    )
    if level != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only resource owners can share",
        )

    # Verify grantee exists
    if grantee_type == GranteeType.user:
        result = await db.execute(select(User).where(User.id == share_create.grantee_id))
        if not result.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    else:
        result = await db.execute(select(UserGroup).where(UserGroup.id == share_create.grantee_id))
        if not result.scalars().first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    # Check for existing share (upsert)
    existing_result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.resource_type == resource_type,
            ResourceShare.resource_id == share_create.resource_id,
            ResourceShare.grantee_type == grantee_type,
            ResourceShare.grantee_id == share_create.grantee_id,
        )
    )
    existing = existing_result.scalars().first()

    if existing:
        # Update permission if share already exists
        existing.permission = permission
        await db.commit()
        await db.refresh(existing)
        return await _enrich_share(existing, db)

    share = ResourceShare(
        resource_type=resource_type,
        resource_id=share_create.resource_id,
        grantee_type=grantee_type,
        grantee_id=share_create.grantee_id,
        permission=permission,
        granted_by=current_user.id,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)
    return await _enrich_share(share, db)


@router.get("/resource/{resource_type}/{resource_id}", response_model=list[ShareResponse])
async def list_resource_shares(
    resource_type: str,
    resource_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all shares for a resource. Only owners/admins can see share list."""
    try:
        rt = ResourceType(resource_type)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid resource type")

    level = await PermissionService.get_permission_level(db, current_user, rt, resource_id)
    if level != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.resource_type == rt,
            ResourceShare.resource_id == resource_id,
        ).order_by(ResourceShare.created_at.desc())
    )
    shares = result.scalars().all()
    return [await _enrich_share(s, db) for s in shares]


@router.patch("/{share_id}", response_model=ShareResponse)
async def update_share(
    share_id: uuid.UUID,
    share_update: ShareUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a share's permission level. Only owners/admins can update."""
    result = await db.execute(select(ResourceShare).where(ResourceShare.id == share_id))
    share = result.scalars().first()

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")

    # Verify owner-level access
    level = await PermissionService.get_permission_level(
        db, current_user, share.resource_type, share.resource_id
    )
    if level != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    try:
        share.permission = PermissionLevel(share_update.permission)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid permission level")

    await db.commit()
    await db.refresh(share)
    return await _enrich_share(share, db)


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_share(
    share_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a share. Owners/admins can revoke, or users can remove shares granted to them."""
    result = await db.execute(select(ResourceShare).where(ResourceShare.id == share_id))
    share = result.scalars().first()

    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")

    # Owner can always revoke, or the grantee can remove their own share
    is_owner = await PermissionService.get_permission_level(
        db, current_user, share.resource_type, share.resource_id
    ) == "owner"
    is_grantee = (
        share.grantee_type == GranteeType.user and share.grantee_id == current_user.id
    )

    if not is_owner and not is_grantee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    await db.delete(share)
    await db.commit()


@router.get("/shared-with-me", response_model=list[SharedWithMeItem])
async def shared_with_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all resources shared with the current user (direct + group shares)."""
    from sqlalchemy import or_, and_

    # Get user's group IDs
    group_ids_result = await db.execute(
        select(user_group_members.c.group_id)
        .where(user_group_members.c.user_id == current_user.id)
    )
    user_group_ids = [r[0] for r in group_ids_result]

    # Build conditions for shares targeting this user
    conditions = [
        and_(
            ResourceShare.grantee_type == GranteeType.user,
            ResourceShare.grantee_id == current_user.id,
        )
    ]
    if user_group_ids:
        conditions.append(
            and_(
                ResourceShare.grantee_type == GranteeType.group,
                ResourceShare.grantee_id.in_(user_group_ids),
            )
        )

    result = await db.execute(
        select(ResourceShare)
        .where(or_(*conditions))
        .order_by(ResourceShare.created_at.desc())
    )
    shares = result.scalars().all()

    items = []
    for share in shares:
        # Get resource name
        resource_name = "Unknown"
        if share.resource_type == ResourceType.transcription:
            t_result = await db.execute(
                select(Transcription.title, Transcription.original_filename)
                .where(Transcription.id == share.resource_id)
            )
            t_row = t_result.first()
            if t_row:
                resource_name = t_row[0] or t_row[1]
        else:
            c_result = await db.execute(
                select(Collection.name).where(Collection.id == share.resource_id)
            )
            c_row = c_result.first()
            if c_row:
                resource_name = c_row[0]

        # Get granter name
        granter_result = await db.execute(
            select(User.display_name, User.email).where(User.id == share.granted_by)
        )
        granter_row = granter_result.first()
        shared_by_name = granter_row[0] or granter_row[1] if granter_row else "Unknown"

        items.append(SharedWithMeItem(
            resource_type=share.resource_type.value,
            resource_id=share.resource_id,
            resource_name=resource_name,
            permission=share.permission.value,
            shared_by_name=shared_by_name,
            shared_at=share.created_at,
        ))

    return items


async def _enrich_share(share: ResourceShare, db: AsyncSession) -> dict:
    """Add grantee info to a share response."""
    grantee = None
    if share.grantee_type == GranteeType.user:
        result = await db.execute(
            select(User).where(User.id == share.grantee_id)
        )
        user = result.scalars().first()
        if user:
            grantee = ShareGranteeInfo(
                id=user.id,
                name=user.display_name or user.email,
                email=user.email,
                type="user",
            )
    else:
        result = await db.execute(
            select(UserGroup).where(UserGroup.id == share.grantee_id)
        )
        group = result.scalars().first()
        if group:
            grantee = ShareGranteeInfo(
                id=group.id,
                name=group.name,
                type="group",
            )

    return {
        "id": share.id,
        "resource_type": share.resource_type.value,
        "resource_id": share.resource_id,
        "grantee_type": share.grantee_type.value,
        "grantee_id": share.grantee_id,
        "permission": share.permission.value,
        "granted_by": share.granted_by,
        "created_at": share.created_at,
        "grantee": grantee,
    }

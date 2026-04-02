import uuid
from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.schemas.user_group import (
    GroupCreate,
    GroupUpdate,
    GroupMemberAdd,
    GroupResponse,
    GroupDetailResponse,
    GroupMemberResponse,
)
from app.models.user import User, UserRole
from app.models.user_group import UserGroup, user_group_members
from app.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/groups", tags=["groups"])


async def _enrich_with_member_count(
    groups: list[UserGroup], db: AsyncSession
) -> list[dict]:
    """Add member_count to each group."""
    if not groups:
        return []
    group_ids = [g.id for g in groups]
    count_result = await db.execute(
        select(
            user_group_members.c.group_id,
            func.count(user_group_members.c.user_id).label("cnt"),
        )
        .where(user_group_members.c.group_id.in_(group_ids))
        .group_by(user_group_members.c.group_id)
    )
    counts = {row[0]: row[1] for row in count_result}

    result = []
    for g in groups:
        data = {
            "id": g.id,
            "name": g.name,
            "description": g.description,
            "created_by": g.created_by,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
            "member_count": counts.get(g.id, 0),
        }
        result.append(data)
    return result


@router.get("", response_model=list[GroupResponse])
async def list_groups(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List groups. Admins see all, users see groups they belong to."""
    if current_user.role == UserRole.admin:
        query = select(UserGroup).order_by(UserGroup.name).offset(skip).limit(limit)
    else:
        # User sees groups they are a member of
        query = (
            select(UserGroup)
            .join(user_group_members, UserGroup.id == user_group_members.c.group_id)
            .where(user_group_members.c.user_id == current_user.id)
            .order_by(UserGroup.name)
            .offset(skip)
            .limit(limit)
        )

    result = await db.execute(query)
    groups = list(result.scalars().all())
    return await _enrich_with_member_count(groups, db)


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group_create: GroupCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group (admin only)."""
    group = UserGroup(
        name=group_create.name,
        description=group_create.description,
        created_by=current_user.id,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)
    enriched = await _enrich_with_member_count([group], db)
    return enriched[0]


@router.get("/{group_id}", response_model=GroupDetailResponse)
async def get_group(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get group detail with members."""
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    # Non-admin must be a member
    if current_user.role != UserRole.admin:
        member_check = await db.execute(
            select(user_group_members.c.user_id).where(
                user_group_members.c.group_id == group_id,
                user_group_members.c.user_id == current_user.id,
            )
        )
        if not member_check.first():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Get members
    members_result = await db.execute(
        select(User)
        .join(user_group_members, User.id == user_group_members.c.user_id)
        .where(user_group_members.c.group_id == group_id)
        .order_by(User.display_name, User.email)
    )
    members = members_result.scalars().all()

    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "created_by": group.created_by,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "member_count": len(members),
        "members": [
            {
                "id": m.id,
                "email": m.email,
                "display_name": m.display_name,
                "role": m.role.value if hasattr(m.role, 'value') else m.role,
            }
            for m in members
        ],
    }


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    group_update: GroupUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a group (admin only)."""
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if group_update.name is not None:
        group.name = group_update.name
    if group_update.description is not None:
        group.description = group_update.description

    await db.commit()
    await db.refresh(group)
    enriched = await _enrich_with_member_count([group], db)
    return enriched[0]


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group (admin only). Also removes associated shares."""
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    # Delete group shares
    from app.models.resource_share import ResourceShare, GranteeType
    shares_result = await db.execute(
        select(ResourceShare).where(
            ResourceShare.grantee_type == GranteeType.group,
            ResourceShare.grantee_id == group_id,
        )
    )
    for share in shares_result.scalars():
        await db.delete(share)

    await db.delete(group)
    await db.commit()


@router.post("/{group_id}/members", response_model=GroupDetailResponse)
async def add_member(
    group_id: uuid.UUID,
    member_add: GroupMemberAdd,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to a group (admin only)."""
    # Verify group exists
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    # Verify user exists
    user_result = await db.execute(select(User).where(User.id == member_add.user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check not already a member
    existing = await db.execute(
        select(user_group_members).where(
            user_group_members.c.group_id == group_id,
            user_group_members.c.user_id == member_add.user_id,
        )
    )
    if existing.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this group",
        )

    await db.execute(
        user_group_members.insert().values(
            group_id=group_id,
            user_id=member_add.user_id,
        )
    )
    await db.commit()

    # Return updated group detail
    return await get_group(group_id, current_user, db)


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from a group (admin only)."""
    result = await db.execute(
        select(user_group_members).where(
            user_group_members.c.group_id == group_id,
            user_group_members.c.user_id == user_id,
        )
    )
    if not result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.execute(
        user_group_members.delete().where(
            user_group_members.c.group_id == group_id,
            user_group_members.c.user_id == user_id,
        )
    )
    await db.commit()

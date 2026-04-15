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
from app.models.user_group import UserGroup, user_group_members, SharingPolicy
from app.models.app_settings import AppSetting
from app.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/groups", tags=["groups"])

ALLOW_USER_GROUP_CREATION_KEY = "allow_user_group_creation"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _user_group_creation_allowed(db: AsyncSession) -> bool:
    """Return True if non-admin users are allowed to create groups."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == ALLOW_USER_GROUP_CREATION_KEY)
    )
    setting = result.scalars().first()
    return setting.value.lower() == "true" if setting else False


def _is_group_owner(group: UserGroup, user: User) -> bool:
    return group.owner_id == user.id or user.role == UserRole.admin


async def _enrich_with_member_count(
    groups: list[UserGroup], db: AsyncSession, current_user: User | None = None
) -> list[dict]:
    """Add member_count (and is_owner) to each group."""
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
            "owner_id": g.owner_id,
            "sharing_policy": g.sharing_policy.value if hasattr(g.sharing_policy, "value") else g.sharing_policy,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
            "member_count": counts.get(g.id, 0),
            "is_owner": _is_group_owner(g, current_user) if current_user else False,
        }
        result.append(data)
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[GroupResponse])
async def list_groups(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    mine: bool = Query(False, description="Only return groups owned by the current user"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List groups.
    - Admins: see all groups (or just their own with mine=true)
    - Users: see groups they belong to or own
    """
    if current_user.role == UserRole.admin and not mine:
        query = select(UserGroup).order_by(UserGroup.name).offset(skip).limit(limit)
    elif mine:
        query = (
            select(UserGroup)
            .where(UserGroup.owner_id == current_user.id)
            .order_by(UserGroup.name)
            .offset(skip)
            .limit(limit)
        )
    else:
        # Member groups (includes owned groups since owner is also a member)
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
    return await _enrich_with_member_count(groups, db, current_user)


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    group_create: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group.
    - Admins: always allowed.
    - Regular users: only when allow_user_group_creation setting is enabled.
    """
    if current_user.role != UserRole.admin:
        if not await _user_group_creation_allowed(db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Group creation is restricted to administrators",
            )

    # Name must be globally unique — return friendly 409 instead of DB IntegrityError
    name_clash = await db.execute(
        select(UserGroup).where(UserGroup.name == group_create.name)
    )
    if name_clash.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A group named '{group_create.name}' already exists",
        )

    policy = SharingPolicy.creator_only
    if group_create.sharing_policy in ("creator_only", "members_allowed"):
        policy = SharingPolicy(group_create.sharing_policy)

    group = UserGroup(
        name=group_create.name,
        description=group_create.description,
        created_by=current_user.id,
        owner_id=current_user.id,
        sharing_policy=policy,
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)

    # Auto-add creator as a member of their own group
    await db.execute(
        user_group_members.insert().values(
            group_id=group.id,
            user_id=current_user.id,
        )
    )
    await db.commit()

    enriched = await _enrich_with_member_count([group], db, current_user)
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

    # Non-admin must be a member or owner
    if current_user.role != UserRole.admin:
        member_check = await db.execute(
            select(user_group_members.c.user_id).where(
                user_group_members.c.group_id == group_id,
                user_group_members.c.user_id == current_user.id,
            )
        )
        if not member_check.first() and group.owner_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

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
        "owner_id": group.owner_id,
        "sharing_policy": group.sharing_policy.value if hasattr(group.sharing_policy, "value") else group.sharing_policy,
        "is_owner": _is_group_owner(group, current_user),
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "member_count": len(members),
        "members": [
            {
                "id": m.id,
                "email": m.email,
                "display_name": m.display_name,
                "role": m.role.value if hasattr(m.role, "value") else m.role,
            }
            for m in members
        ],
    }


@router.patch("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: uuid.UUID,
    group_update: GroupUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a group.
    - Admins: can update any group.
    - Owner: can update their own group's name, description, and sharing_policy.
    """
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not _is_group_owner(group, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can edit this group")

    if group_update.name is not None and group_update.name != group.name:
        # Name must be globally unique
        name_clash = await db.execute(
            select(UserGroup).where(
                UserGroup.name == group_update.name,
                UserGroup.id != group_id,
            )
        )
        if name_clash.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A group named '{group_update.name}' already exists",
            )
        group.name = group_update.name
    if group_update.description is not None:
        group.description = group_update.description
    if group_update.sharing_policy is not None:
        if group_update.sharing_policy not in ("creator_only", "members_allowed"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid sharing_policy")
        group.sharing_policy = SharingPolicy(group_update.sharing_policy)

    await db.commit()
    await db.refresh(group)
    enriched = await _enrich_with_member_count([group], db, current_user)
    return enriched[0]


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group. Admins can delete any group; owners can delete their own."""
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()

    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not _is_group_owner(group, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can delete this group")

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a user to a group. Admins or group owner only."""
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not _is_group_owner(group, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can manage members")

    user_result = await db.execute(select(User).where(User.id == member_add.user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(user_group_members).where(
            user_group_members.c.group_id == group_id,
            user_group_members.c.user_id == member_add.user_id,
        )
    )
    if existing.first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member of this group")

    await db.execute(
        user_group_members.insert().values(group_id=group_id, user_id=member_add.user_id)
    )
    await db.commit()
    return await get_group(group_id, current_user, db)


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from a group. Admins or group owner only."""
    result = await db.execute(select(UserGroup).where(UserGroup.id == group_id))
    group = result.scalars().first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not _is_group_owner(group, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can manage members")

    # Owner cannot remove themselves
    if user_id == group.owner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the group owner")

    member_result = await db.execute(
        select(user_group_members).where(
            user_group_members.c.group_id == group_id,
            user_group_members.c.user_id == user_id,
        )
    )
    if not member_result.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    await db.execute(
        user_group_members.delete().where(
            user_group_members.c.group_id == group_id,
            user_group_members.c.user_id == user_id,
        )
    )
    await db.commit()

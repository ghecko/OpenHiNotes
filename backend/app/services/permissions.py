"""Centralized permission service for access control.

Resolves access by checking (in order):
1. Admin bypass
2. Resource ownership
3. Direct user share
4. Group share (best level across all user's groups)
5. Collection inheritance (for transcriptions in shared collections)
"""

import uuid
from typing import Optional, Literal

from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.models.transcription import Transcription
from app.models.collection import Collection
from app.models.resource_share import (
    ResourceShare,
    ResourceType,
    GranteeType,
    PermissionLevel,
)
from app.models.user_group import user_group_members


PermLevel = Literal["owner", "write", "read"]


class PermissionService:
    """Centralized permission resolution for transcriptions and collections."""

    @staticmethod
    async def get_permission_level(
        db: AsyncSession,
        user: User,
        resource_type: ResourceType,
        resource_id: uuid.UUID,
    ) -> Optional[PermLevel]:
        """Return the effective permission level for a user on a resource.

        Returns "owner", "write", "read", or None (no access).
        """
        # 1. Admin bypass → owner-level access
        if user.role == UserRole.admin:
            return "owner"

        # 2. Check ownership
        if resource_type == ResourceType.transcription:
            result = await db.execute(
                select(Transcription.user_id, Transcription.collection_id)
                .where(Transcription.id == resource_id)
            )
            row = result.first()
            if not row:
                return None
            owner_id, collection_id = row[0], row[1]
        else:  # collection
            result = await db.execute(
                select(Collection.user_id).where(Collection.id == resource_id)
            )
            row = result.first()
            if not row:
                return None
            owner_id = row[0]
            collection_id = None

        if owner_id == user.id:
            return "owner"

        # 3. Get user's group IDs for group-based checks
        group_ids_result = await db.execute(
            select(user_group_members.c.group_id)
            .where(user_group_members.c.user_id == user.id)
        )
        user_group_ids = [r[0] for r in group_ids_result]

        # 4. Check direct shares + group shares on this resource
        best_level = await PermissionService._best_share_level(
            db, resource_type, resource_id, user.id, user_group_ids
        )

        # 5. For transcriptions, also check collection-level shares
        if resource_type == ResourceType.transcription and collection_id:
            collection_level = await PermissionService._best_share_level(
                db, ResourceType.collection, collection_id, user.id, user_group_ids
            )
            if collection_level:
                if not best_level:
                    best_level = collection_level
                elif collection_level == "write":
                    best_level = "write"

        return best_level

    @staticmethod
    async def _best_share_level(
        db: AsyncSession,
        resource_type: ResourceType,
        resource_id: uuid.UUID,
        user_id: uuid.UUID,
        user_group_ids: list[uuid.UUID],
    ) -> Optional[PermLevel]:
        """Find the best permission level from direct + group shares."""
        conditions = [
            and_(
                ResourceShare.resource_type == resource_type,
                ResourceShare.resource_id == resource_id,
                ResourceShare.grantee_type == GranteeType.user,
                ResourceShare.grantee_id == user_id,
            )
        ]

        if user_group_ids:
            conditions.append(
                and_(
                    ResourceShare.resource_type == resource_type,
                    ResourceShare.resource_id == resource_id,
                    ResourceShare.grantee_type == GranteeType.group,
                    ResourceShare.grantee_id.in_(user_group_ids),
                )
            )

        result = await db.execute(
            select(ResourceShare.permission).where(or_(*conditions))
        )
        permissions = [r[0] for r in result]

        if not permissions:
            return None
        if PermissionLevel.write in permissions:
            return "write"
        return "read"

    @staticmethod
    async def check_access(
        db: AsyncSession,
        user: User,
        resource_type: ResourceType,
        resource_id: uuid.UUID,
        required: str = "read",
    ) -> bool:
        """Check if user has at least the required permission level."""
        level = await PermissionService.get_permission_level(
            db, user, resource_type, resource_id
        )
        if level is None:
            return False
        if level == "owner":
            return True
        if required == "read":
            return level in ("read", "write")
        if required == "write":
            return level == "write"
        return False

    @staticmethod
    async def list_accessible_ids(
        db: AsyncSession,
        user: User,
        resource_type: ResourceType,
        permission: str = "read",
    ) -> list[uuid.UUID]:
        """Return all resource IDs the user can access at the given permission level.

        Used for list endpoints to filter visible resources.
        """
        if user.role == UserRole.admin:
            return []  # Caller should skip filtering for admins

        # 1. Owned resources
        if resource_type == ResourceType.transcription:
            owned_q = select(Transcription.id).where(Transcription.user_id == user.id)
        else:
            owned_q = select(Collection.id).where(Collection.user_id == user.id)

        owned_result = await db.execute(owned_q)
        accessible = set(r[0] for r in owned_result)

        # 2. User's group IDs
        group_ids_result = await db.execute(
            select(user_group_members.c.group_id)
            .where(user_group_members.c.user_id == user.id)
        )
        user_group_ids = [r[0] for r in group_ids_result]

        # 3. Direct + group shares on this resource type
        share_conditions = [
            and_(
                ResourceShare.grantee_type == GranteeType.user,
                ResourceShare.grantee_id == user.id,
            )
        ]
        if user_group_ids:
            share_conditions.append(
                and_(
                    ResourceShare.grantee_type == GranteeType.group,
                    ResourceShare.grantee_id.in_(user_group_ids),
                )
            )

        perm_filter = (
            ResourceShare.permission == PermissionLevel.write
            if permission == "write"
            else ResourceShare.permission.in_([PermissionLevel.read, PermissionLevel.write])
        )

        share_q = (
            select(ResourceShare.resource_id)
            .where(
                ResourceShare.resource_type == resource_type,
                perm_filter,
                or_(*share_conditions),
            )
        )
        share_result = await db.execute(share_q)
        accessible.update(r[0] for r in share_result)

        # 4. For transcriptions, add those in shared collections
        if resource_type == ResourceType.transcription:
            collection_share_q = (
                select(ResourceShare.resource_id)
                .where(
                    ResourceShare.resource_type == ResourceType.collection,
                    perm_filter,
                    or_(*share_conditions),
                )
            )
            coll_result = await db.execute(collection_share_q)
            shared_coll_ids = [r[0] for r in coll_result]

            if shared_coll_ids:
                trans_in_colls = await db.execute(
                    select(Transcription.id)
                    .where(Transcription.collection_id.in_(shared_coll_ids))
                )
                accessible.update(r[0] for r in trans_in_colls)

        return list(accessible)

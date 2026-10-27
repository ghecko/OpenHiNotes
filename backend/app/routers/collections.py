from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.schemas.collection import (
    CollectionCreate,
    CollectionResponse,
    CollectionUpdate,
    AssignCollectionRequest,
)
from app.models.collection import Collection
from app.models.transcription import Transcription
from app.models.collection_transcription import CollectionTranscription
from app.schemas.transcription import TranscriptionResponse
from app.models.user import User, UserRole
from app.models.resource_share import ResourceType
from app.dependencies import get_current_user
from app.services.permissions import PermissionService
import uuid

router = APIRouter(prefix="/collections", tags=["collections"])


async def _visible_transcription_filter(db: AsyncSession, user: User):
    """WHERE clause on CollectionTranscription.transcription_id limiting it to
    what ``user`` can read, or None for admins (no limit)."""
    if user.role == UserRole.admin:
        return None
    accessible = await PermissionService.list_accessible_ids(db, user, ResourceType.transcription)
    return CollectionTranscription.transcription_id.in_(accessible)


async def _enrich_with_count(
    collections: list[Collection], db: AsyncSession, user: User
) -> list[dict]:
    """Add transcription_count (transcriptions ``user`` can read) to each collection."""
    if not collections:
        return []

    coll_ids = [c.id for c in collections]
    count_query = (
        select(
            CollectionTranscription.collection_id,
            func.count(CollectionTranscription.transcription_id).label("cnt"),
        )
        .where(CollectionTranscription.collection_id.in_(coll_ids))
        .group_by(CollectionTranscription.collection_id)
    )
    visible = await _visible_transcription_filter(db, user)
    if visible is not None:
        count_query = count_query.where(visible)
    count_result = await db.execute(count_query)
    counts = {row[0]: row[1] for row in count_result}

    result = []
    for c in collections:
        data = {
            "id": c.id,
            "user_id": c.user_id,
            "name": c.name,
            "color": c.color,
            "description": c.description,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "transcription_count": counts.get(c.id, 0),
        }
        result.append(data)
    return result


async def _enrich_with_count_and_permissions(
    collections: list[Collection], user: User, db: AsyncSession
) -> list[dict]:
    """Add transcription_count and permission_level to each collection."""
    enriched = await _enrich_with_count(collections, db, user)
    for i, c in enumerate(collections):
        level = await PermissionService.get_permission_level(
            db, user, ResourceType.collection, c.id
        )
        enriched[i]["permission_level"] = level
    return enriched


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's collections (owned + shared)."""
    if current_user.role == UserRole.admin:
        query = select(Collection).order_by(Collection.name).offset(skip).limit(limit)
    else:
        # Get accessible collection IDs
        accessible_ids = await PermissionService.list_accessible_ids(
            db, current_user, ResourceType.collection
        )
        query = (
            select(Collection)
            .where(Collection.id.in_(accessible_ids))
            .order_by(Collection.name)
            .offset(skip)
            .limit(limit)
        )

    result = await db.execute(query)
    collections = list(result.scalars().all())
    return await _enrich_with_count_and_permissions(collections, current_user, db)


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    collection_create: CollectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new collection."""
    collection = Collection(
        name=collection_create.name,
        color=collection_create.color,
        description=collection_create.description,
        user_id=current_user.id,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    enriched = await _enrich_with_count([collection], db, current_user)
    enriched[0]["permission_level"] = "owner"
    return enriched[0]


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a collection by ID."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.collection, collection_id, "read"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    enriched = await _enrich_with_count_and_permissions([collection], current_user, db)
    return enriched[0]


@router.patch("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: uuid.UUID,
    collection_update: CollectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a collection. Requires write permission."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.collection, collection_id, "write"
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    if collection_update.name is not None:
        collection.name = collection_update.name
    if collection_update.color is not None:
        collection.color = collection_update.color
    if collection_update.description is not None:
        collection.description = collection_update.description

    await db.commit()
    await db.refresh(collection)
    enriched = await _enrich_with_count_and_permissions([collection], current_user, db)
    return enriched[0]


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a collection. Only owners and admins can delete."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )

    level = await PermissionService.get_permission_level(
        db, current_user, ResourceType.collection, collection_id
    )
    if level != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owners can delete collections",
        )

    await db.delete(collection)
    await db.commit()


@router.get("/{collection_id}/transcriptions", response_model=list[TranscriptionResponse])
async def list_collection_transcriptions(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List the transcriptions of a collection that the user can read."""
    # Verify collection access
    has_access = await PermissionService.check_access(
        db, current_user, ResourceType.collection, collection_id, "read"
    )
    if not has_access:
        # Check if collection even exists
        result = await db.execute(
            select(Collection).where(Collection.id == collection_id)
        )
        if not result.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Collection not found",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    query = (
        select(Transcription)
        .join(CollectionTranscription, CollectionTranscription.transcription_id == Transcription.id)
        .where(CollectionTranscription.collection_id == collection_id)
        .order_by(Transcription.created_at.desc())
    )
    visible = await _visible_transcription_filter(db, current_user)
    if visible is not None:
        query = query.where(visible)
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{collection_id}/transcriptions/{transcription_id}")
async def assign_transcription(
    collection_id: uuid.UUID,
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a transcription to a collection (it stays in its other collections).

    Requires write on the collection and read on the transcription: a
    transcription shared with you can go into your own collections.
    """
    # Verify write access on collection
    has_coll_access = await PermissionService.check_access(
        db, current_user, ResourceType.collection, collection_id, "write"
    )
    if not has_coll_access:
        raise HTTPException(status_code=403, detail="Not authorized to modify this collection")

    # Verify transcription exists and can be read
    exists = (await db.execute(select(Transcription.id).where(Transcription.id == transcription_id))).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Transcription not found")
    has_trans_access = await PermissionService.check_access(
        db, current_user, ResourceType.transcription, transcription_id, "read"
    )
    if not has_trans_access:
        raise HTTPException(status_code=403, detail="Not authorized to access this transcription")

    await add_to_collection(db, collection_id, [transcription_id], current_user.id)
    await db.commit()
    return {"status": "ok"}


@router.delete("/{collection_id}/transcriptions/{transcription_id}")
async def remove_transcription_from_collection(
    collection_id: uuid.UUID,
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a transcription from a collection (not from its other collections)."""
    membership = (await db.execute(
        select(CollectionTranscription).where(
            CollectionTranscription.collection_id == collection_id,
            CollectionTranscription.transcription_id == transcription_id,
        )
    )).scalars().first()
    if not membership:
        raise HTTPException(status_code=404, detail="Transcription not found in this collection")

    if not await can_remove_membership(db, current_user, membership):
        raise HTTPException(status_code=403, detail="Not authorized")

    await db.delete(membership)
    await db.commit()
    return {"status": "ok"}


async def add_to_collection(
    db: AsyncSession, collection_id: uuid.UUID, transcription_ids: list[uuid.UUID], added_by_id: uuid.UUID
) -> int:
    """Add memberships that do not exist yet (no commit). Returns how many were added."""
    existing = set((await db.execute(
        select(CollectionTranscription.transcription_id).where(
            CollectionTranscription.collection_id == collection_id,
            CollectionTranscription.transcription_id.in_(transcription_ids),
        )
    )).scalars().all())
    new_ids = [tid for tid in dict.fromkeys(transcription_ids) if tid not in existing]
    db.add_all(
        CollectionTranscription(collection_id=collection_id, transcription_id=tid, added_by_id=added_by_id)
        for tid in new_ids
    )
    return len(new_ids)


async def can_remove_membership(db: AsyncSession, user: User, membership: CollectionTranscription) -> bool:
    """Whoever can edit the collection, whoever added the transcription to it,
    or the transcription's owner (it is their data) may take it out."""
    if membership.added_by_id == user.id:
        return True
    if await PermissionService.check_access(db, user, ResourceType.collection, membership.collection_id, "write"):
        return True
    level = await PermissionService.get_permission_level(
        db, user, ResourceType.transcription, membership.transcription_id
    )
    return level == "owner"

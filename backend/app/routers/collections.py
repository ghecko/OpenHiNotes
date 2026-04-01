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
from app.models.user import User, UserRole
from app.dependencies import get_current_user
import uuid

router = APIRouter(prefix="/collections", tags=["collections"])


async def _enrich_with_count(
    collections: list[Collection], db: AsyncSession
) -> list[dict]:
    """Add transcription_count to each collection."""
    if not collections:
        return []

    coll_ids = [c.id for c in collections]
    count_result = await db.execute(
        select(
            Transcription.collection_id,
            func.count(Transcription.id).label("cnt"),
        )
        .where(Transcription.collection_id.in_(coll_ids))
        .group_by(Transcription.collection_id)
    )
    counts = {row[0]: row[1] for row in count_result}

    result = []
    for c in collections:
        data = {
            "id": c.id,
            "user_id": c.user_id,
            "name": c.name,
            "description": c.description,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "transcription_count": counts.get(c.id, 0),
        }
        result.append(data)
    return result


@router.get("", response_model=list[CollectionResponse])
async def list_collections(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's collections."""
    query = select(Collection).order_by(Collection.name)
    if current_user.role != UserRole.admin:
        query = query.where(Collection.user_id == current_user.id)
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    collections = list(result.scalars().all())
    return await _enrich_with_count(collections, db)


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    collection_create: CollectionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new collection."""
    collection = Collection(
        name=collection_create.name,
        description=collection_create.description,
        user_id=current_user.id,
    )
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    enriched = await _enrich_with_count([collection], db)
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
    if current_user.role != UserRole.admin and collection.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    enriched = await _enrich_with_count([collection], db)
    return enriched[0]


@router.patch("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: uuid.UUID,
    collection_update: CollectionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a collection."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )
    if current_user.role != UserRole.admin and collection.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    if collection_update.name is not None:
        collection.name = collection_update.name
    if collection_update.description is not None:
        collection.description = collection_update.description

    await db.commit()
    await db.refresh(collection)
    enriched = await _enrich_with_count([collection], db)
    return enriched[0]


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a collection. Transcriptions are NOT deleted (set to null)."""
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )
    if current_user.role != UserRole.admin and collection.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    await db.delete(collection)
    await db.commit()


@router.get("/{collection_id}/transcriptions")
async def list_collection_transcriptions(
    collection_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all transcriptions in a collection."""
    # Verify collection access
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()

    if not collection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection not found",
        )
    if current_user.role != UserRole.admin and collection.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized",
        )

    result = await db.execute(
        select(Transcription)
        .where(Transcription.collection_id == collection_id)
        .order_by(Transcription.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/{collection_id}/transcriptions/{transcription_id}")
async def assign_transcription(
    collection_id: uuid.UUID,
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a transcription to a collection."""
    # Verify collection
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalars().first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    if current_user.role != UserRole.admin and collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Verify transcription
    result = await db.execute(
        select(Transcription).where(Transcription.id == transcription_id)
    )
    transcription = result.scalars().first()
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcription not found")
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    transcription.collection_id = collection_id
    await db.commit()
    return {"status": "ok"}


@router.delete("/{collection_id}/transcriptions/{transcription_id}")
async def remove_transcription_from_collection(
    collection_id: uuid.UUID,
    transcription_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a transcription from a collection (sets collection_id to null)."""
    result = await db.execute(
        select(Transcription).where(
            Transcription.id == transcription_id,
            Transcription.collection_id == collection_id,
        )
    )
    transcription = result.scalars().first()
    if not transcription:
        raise HTTPException(status_code=404, detail="Transcription not found in this collection")
    if current_user.role != UserRole.admin and transcription.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    transcription.collection_id = None
    await db.commit()
    return {"status": "ok"}

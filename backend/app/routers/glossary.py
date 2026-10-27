from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.glossary import GlossaryTerm
from app.models.collection import Collection
from app.models.user import User
from app.models.resource_share import ResourceType
from app.dependencies import get_current_user
from app.schemas.glossary import GlossaryTermCreate, GlossaryTermUpdate, GlossaryTermResponse
from app.services.permissions import PermissionService
from app.services.glossary import normalize_aliases
from typing import Optional
import uuid

router = APIRouter(prefix="/glossary", tags=["glossary"])


async def _check_collection(db: AsyncSession, user: User, collection_id: uuid.UUID, required: str) -> None:
    exists = (await db.execute(select(Collection.id).where(Collection.id == collection_id))).first()
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collection not found")
    if not await PermissionService.check_access(db, user, ResourceType.collection, collection_id, required):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")


async def _get_editable_term(db: AsyncSession, user: User, term_id: uuid.UUID) -> GlossaryTerm:
    term = (await db.execute(select(GlossaryTerm).where(GlossaryTerm.id == term_id))).scalars().first()
    if not term:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Term not found")
    if term.collection_id:
        await _check_collection(db, user, term.collection_id, "write")
    elif term.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Term not found")
    return term


async def _find_same_spelling(
    db: AsyncSession, user: User, collection_id: Optional[uuid.UUID], term: str, exclude: Optional[uuid.UUID] = None
) -> Optional[GlossaryTerm]:
    query = select(GlossaryTerm).where(func.lower(GlossaryTerm.term) == term.lower())
    if collection_id:
        query = query.where(GlossaryTerm.collection_id == collection_id)
    else:
        query = query.where(GlossaryTerm.user_id == user.id, GlossaryTerm.collection_id.is_(None))
    if exclude:
        query = query.where(GlossaryTerm.id != exclude)
    return (await db.execute(query)).scalars().first()


@router.get("", response_model=list[GlossaryTermResponse])
async def list_terms(
    collection_id: Optional[uuid.UUID] = Query(None, description="Omit for your general vocabulary"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Terms of the current user's general vocabulary, or of a collection."""
    if collection_id:
        await _check_collection(db, current_user, collection_id, "read")
        query = select(GlossaryTerm).where(GlossaryTerm.collection_id == collection_id)
    else:
        query = select(GlossaryTerm).where(
            GlossaryTerm.user_id == current_user.id, GlossaryTerm.collection_id.is_(None)
        )
    result = await db.execute(query.order_by(func.lower(GlossaryTerm.term)))
    return list(result.scalars().all())


@router.post("", response_model=GlossaryTermResponse, status_code=status.HTTP_201_CREATED)
async def add_term(
    data: GlossaryTermCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a term; if the same spelling already exists in that scope, merge the aliases into it."""
    if data.collection_id:
        await _check_collection(db, current_user, data.collection_id, "write")
    spelling = " ".join(data.term.split())
    if not spelling:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Term is empty")
    existing = await _find_same_spelling(db, current_user, data.collection_id, spelling)
    if existing:
        existing.aliases = normalize_aliases(existing.term, [*(existing.aliases or []), *data.aliases])
        await db.commit()
        await db.refresh(existing)
        return existing
    term = GlossaryTerm(
        user_id=current_user.id,
        collection_id=data.collection_id,
        term=spelling,
        aliases=normalize_aliases(spelling, data.aliases),
    )
    db.add(term)
    await db.commit()
    await db.refresh(term)
    return term


@router.patch("/{term_id}", response_model=GlossaryTermResponse)
async def update_term(
    term_id: uuid.UUID,
    data: GlossaryTermUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    term = await _get_editable_term(db, current_user, term_id)
    if data.term is not None:
        spelling = " ".join(data.term.split())
        if not spelling:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Term is empty")
        if await _find_same_spelling(db, current_user, term.collection_id, spelling, exclude=term.id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"'{spelling}' is already in this vocabulary")
        term.term = spelling
    if data.aliases is not None:
        term.aliases = data.aliases
    term.aliases = normalize_aliases(term.term, term.aliases or [])
    await db.commit()
    await db.refresh(term)
    return term


@router.delete("/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_term(
    term_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    term = await _get_editable_term(db, current_user, term_id)
    await db.delete(term)
    await db.commit()

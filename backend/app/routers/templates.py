from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.database import get_db
from app.schemas.template import (
    SummaryTemplateCreate,
    SummaryTemplateResponse,
    SummaryTemplateUpdate,
)
from app.models.template import SummaryTemplate
from app.models.user import User
from app.dependencies import get_current_user, require_admin
import uuid

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[SummaryTemplateResponse])
async def list_templates(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    include_inactive: bool = Query(False),
    target_type: Optional[str] = Query(None, regex="^(record|whisper)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List summary templates. Optionally filter by target_type (record/whisper).
    When target_type is given, returns templates matching that type OR 'both'."""
    query = select(SummaryTemplate)
    if not include_inactive or current_user.role.value != "admin":
        query = query.where(SummaryTemplate.is_active == True)
    if target_type:
        query = query.where(
            or_(
                SummaryTemplate.target_type == target_type,
                SummaryTemplate.target_type == "both",
            )
        )
    result = await db.execute(query.offset(skip).limit(limit))
    templates = result.scalars().all()
    return templates


@router.patch("/{template_id}/toggle", response_model=SummaryTemplateResponse)
async def toggle_template(
    template_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a template's active state (admin only)."""
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    template.is_active = not template.is_active
    await db.commit()
    await db.refresh(template)
    return template


@router.post("", response_model=SummaryTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_create: SummaryTemplateCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new summary template (admin only)."""
    template = SummaryTemplate(
        name=template_create.name,
        description=template_create.description,
        prompt_template=template_create.prompt_template,
        category=template_create.category,
        target_type=template_create.target_type,
        created_by=current_user.id,
        is_active=template_create.is_active,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/{template_id}", response_model=SummaryTemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a summary template by ID."""
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    return template


@router.patch("/{template_id}", response_model=SummaryTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    template_update: SummaryTemplateUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a summary template (admin only)."""
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    if template_update.name is not None:
        template.name = template_update.name
    if template_update.description is not None:
        template.description = template_update.description
    if template_update.prompt_template is not None:
        template.prompt_template = template_update.prompt_template
    if template_update.category is not None:
        template.category = template_update.category
    if template_update.target_type is not None:
        template.target_type = template_update.target_type
    if template_update.is_active is not None:
        template.is_active = template_update.is_active

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete/deactivate a summary template (admin only)."""
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    if template.is_default:
        # Default (built-in) templates can only be deactivated, not deleted
        template.is_active = False
        await db.commit()
    else:
        # User-created templates can be permanently deleted
        await db.delete(template)
        await db.commit()

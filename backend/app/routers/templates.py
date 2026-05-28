from datetime import datetime
from typing import Optional
import uuid

from fastapi import APIRouter, HTTPException, status, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.schemas.template import (
    SummaryTemplateCreate,
    SummaryTemplateResponse,
    SummaryTemplateUpdate,
    TemplateRejectRequest,
)
from app.models.template import SummaryTemplate, TemplateVisibility
from app.models.user import User, UserRole
from app.dependencies import (
    get_current_user,
    require_template_manager,
)
from app.services import notifications as notif_service


router = APIRouter(prefix="/templates", tags=["templates"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_template_manager(user: User) -> bool:
    """True when the user has template-management privileges (admin or scoped role)."""
    return user.role in (UserRole.admin, UserRole.template_manager)


def _can_edit(user: User, template: SummaryTemplate) -> bool:
    """Permission rule for editing a template.

    - Admin or template_manager: can edit anything (including built-in templates).
    - Creator: can edit while the template is `private` or `pending_review`.
      Once the template is `public` it becomes admin-owned (per product
      decision for Sprint 6), so non-privileged creators can no longer edit.
    - Default templates (seeded `is_default=True`) are manager-only.
    """
    if _is_template_manager(user):
        return True
    if template.is_default:
        return False
    if template.created_by != user.id:
        return False
    return template.visibility in (
        TemplateVisibility.private,
        TemplateVisibility.pending_review,
    )


def _can_view(user: User, template: SummaryTemplate) -> bool:
    """Permission rule for viewing a single template by ID."""
    if _is_template_manager(user):
        return True
    if template.visibility == TemplateVisibility.public:
        return True
    # private + pending_review are visible to the creator only
    return template.created_by == user.id


# ---------------------------------------------------------------------------
# List & get
# ---------------------------------------------------------------------------


@router.get("", response_model=list[SummaryTemplateResponse])
async def list_templates(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    include_inactive: bool = Query(False),
    target_type: Optional[str] = Query(None, regex="^(record|whisper)$"),
    visibility: Optional[str] = Query(
        None, regex="^(private|pending_review|public)$"
    ),
    mine: bool = Query(False, description="Return only the current user's templates"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List summary templates.

    Visibility rules:
    - Non-admins see: all `public` templates + their own private/pending ones.
    - Admins see: everything, unless filtered.

    Filters:
    - `target_type`: matches that type OR `both`.
    - `visibility`: exact match (admin-only filter except when combined with `mine`).
    - `mine`: scope to templates where `created_by == current_user`.
    - `include_inactive`: admins only — non-admins never see inactive templates.
    """
    query = select(SummaryTemplate)

    # Visibility scoping — privileged users (admin/template_manager) see
    # everything; regular users only see public templates OR their own.
    if not _is_template_manager(current_user):
        query = query.where(
            or_(
                SummaryTemplate.visibility == TemplateVisibility.public,
                SummaryTemplate.created_by == current_user.id,
            )
        )

    # Active filter — regular users never see inactive templates; privileged
    # users only see them when opting in with ``include_inactive``.
    if not _is_template_manager(current_user) or not include_inactive:
        query = query.where(SummaryTemplate.is_active == True)  # noqa: E712

    # Target-type filter (whisper/record → match that OR "both")
    if target_type:
        query = query.where(
            or_(
                SummaryTemplate.target_type == target_type,
                SummaryTemplate.target_type == "both",
            )
        )

    # Visibility-specific filter. For non-admins, `pending_review`/`private`
    # is still only their own, because of the scoping clause above.
    if visibility:
        query = query.where(SummaryTemplate.visibility == visibility)

    # "Mine" filter — useful for the user's template management UI.
    if mine:
        query = query.where(SummaryTemplate.created_by == current_user.id)

    result = await db.execute(query.offset(skip).limit(limit))
    return result.scalars().all()


@router.get("/pending-review", response_model=list[SummaryTemplateResponse])
async def list_pending_review(
    current_user: User = Depends(require_template_manager),
    db: AsyncSession = Depends(get_db),
):
    """Review queue: templates awaiting approval (admin or template_manager)."""
    result = await db.execute(
        select(SummaryTemplate)
        .where(SummaryTemplate.visibility == TemplateVisibility.pending_review)
        .order_by(SummaryTemplate.updated_at.asc())
    )
    return result.scalars().all()


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
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    if not _can_view(current_user, template):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    return template


# ---------------------------------------------------------------------------
# Create / update / delete
# ---------------------------------------------------------------------------


@router.post("", response_model=SummaryTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_create: SummaryTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new summary template.

    - Admins and template_managers create directly as `public` (current
      behaviour preserved for admins; extended to the scoped role).
    - Regular users create as `private`; they can then submit for review.
    """
    initial_visibility = (
        TemplateVisibility.public if _is_template_manager(current_user) else TemplateVisibility.private
    )

    template = SummaryTemplate(
        name=template_create.name,
        description=template_create.description,
        prompt_template=template_create.prompt_template,
        category=template_create.category,
        target_type=template_create.target_type,
        created_by=current_user.id,
        is_active=template_create.is_active,
        visibility=initial_visibility,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/{template_id}", response_model=SummaryTemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    template_update: SummaryTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a summary template.

    Admins can edit anything. Non-admin creators can edit their own template
    while it is `private` or `pending_review`; once it becomes `public`, only
    admins can edit.
    """
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    if not _can_edit(current_user, template):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this template",
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
    # Only privileged users get to flip is_active — it's a moderation control.
    if template_update.is_active is not None:
        if not _is_template_manager(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins or template managers can toggle template active state",
            )
        template.is_active = template_update.is_active

    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/{template_id}/toggle", response_model=SummaryTemplateResponse)
async def toggle_template(
    template_id: uuid.UUID,
    current_user: User = Depends(require_template_manager),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a template's active state (admin or template_manager)."""
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    template.is_active = not template.is_active
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a template.

    - Built-in (`is_default=True`) templates are never deleted; privileged
      users can only deactivate them.
    - Privileged users (admin or template_manager) can delete any
      non-default template.
    - Regular creators can delete their own private or pending templates.
    """
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    if template.is_default:
        if not _is_template_manager(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Built-in templates can only be managed by admins or template managers",
            )
        template.is_active = False
        await db.commit()
        return

    if not _can_edit(current_user, template):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this template",
        )

    await db.delete(template)
    await db.commit()


# ---------------------------------------------------------------------------
# Review flow
# ---------------------------------------------------------------------------


@router.post("/{template_id}/submit", response_model=SummaryTemplateResponse)
async def submit_for_review(
    template_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Creator submits their private template for admin review."""
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )

    if template.created_by != current_user.id and not _is_template_manager(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can submit this template",
        )
    if template.visibility != TemplateVisibility.private:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template cannot be submitted from state '{template.visibility.value if hasattr(template.visibility, 'value') else template.visibility}'",
        )

    template.visibility = TemplateVisibility.pending_review
    # Clear any stale feedback from a previous rejection.
    template.review_feedback = None
    template.reviewed_by = None
    template.reviewed_at = None
    await db.commit()
    await db.refresh(template)
    return template


@router.post("/{template_id}/approve", response_model=SummaryTemplateResponse)
async def approve_template(
    template_id: uuid.UUID,
    current_user: User = Depends(require_template_manager),
    db: AsyncSession = Depends(get_db),
):
    """Reviewer approves a pending template → visibility becomes `public`.

    Per Sprint 6 decision, a public template is admin-owned: the original
    creator can no longer edit it. The `created_by` field is preserved for
    attribution, but the edit permission check in `_can_edit` denies the
    creator once the template is public.
    """
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    if template.visibility != TemplateVisibility.pending_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only templates in 'pending_review' can be approved",
        )

    template.visibility = TemplateVisibility.public
    template.reviewed_by = current_user.id
    template.reviewed_at = datetime.utcnow()
    template.review_feedback = None

    # Fire in-app notification to the creator; flush alongside the template
    # change so the whole thing is one commit.
    await notif_service.notify_template_approved(
        db,
        user_id=template.created_by,
        template_name=template.name,
        template_id=template.id,
        commit=False,
    )

    await db.commit()
    await db.refresh(template)
    return template


@router.post("/{template_id}/reject", response_model=SummaryTemplateResponse)
async def reject_template(
    template_id: uuid.UUID,
    payload: TemplateRejectRequest,
    current_user: User = Depends(require_template_manager),
    db: AsyncSession = Depends(get_db),
):
    """Reviewer rejects a pending template → visibility returns to `private`.

    Optional reviewer `feedback` is stored on the template and surfaced in
    the creator's notification so they know what to fix.
    """
    result = await db.execute(
        select(SummaryTemplate).where(SummaryTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template not found"
        )
    if template.visibility != TemplateVisibility.pending_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only templates in 'pending_review' can be rejected",
        )

    template.visibility = TemplateVisibility.private
    template.reviewed_by = current_user.id
    template.reviewed_at = datetime.utcnow()
    template.review_feedback = payload.feedback

    await notif_service.notify_template_rejected(
        db,
        user_id=template.created_by,
        template_name=template.name,
        template_id=template.id,
        feedback=payload.feedback,
        commit=False,
    )

    await db.commit()
    await db.refresh(template)
    return template

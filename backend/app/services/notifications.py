"""Tiny helper for creating in-app notifications.

Kept intentionally small — templated notifications for Sprint 6 plus a
generic ``create`` for future callers. No email integration here; that can
be layered in later by composing this with the existing email service.
"""

from typing import Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    commit: bool = True,
) -> Notification:
    """Create a notification for a single user.

    The caller controls whether we commit immediately. When composed inside
    another transaction (e.g. template approval), pass ``commit=False`` so the
    notification is flushed alongside the caller's changes.
    """
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        link=link,
    )
    db.add(notification)
    if commit:
        await db.commit()
        await db.refresh(notification)
    else:
        await db.flush()
    return notification


async def notify_template_approved(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    template_name: str,
    template_id: uuid.UUID,
    commit: bool = False,
) -> Notification:
    return await create_notification(
        db,
        user_id=user_id,
        type="template_approved",
        title="Template approved",
        body=f"Your template \u201c{template_name}\u201d has been approved and is now available to everyone.",
        link="/admin?tab=templates",
        commit=commit,
    )


async def notify_template_rejected(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    template_name: str,
    template_id: uuid.UUID,
    feedback: Optional[str],
    commit: bool = False,
) -> Notification:
    body = f"Your template \u201c{template_name}\u201d was not approved."
    if feedback:
        body += f" Reviewer feedback: {feedback}"
    return await create_notification(
        db,
        user_id=user_id,
        type="template_rejected",
        title="Template not approved",
        body=body,
        # User lands on their templates; frontend can highlight the rejected one.
        link=f"/templates?focus={template_id}",
        commit=commit,
    )


async def notify_transcription_completed(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    transcription_id: uuid.UUID,
    display_name: str,
    failed: bool = False,
    error: Optional[str] = None,
    commit: bool = True,
) -> Notification:
    """Phase 6.5 — drop an in-app notification when a transcription
    finishes processing (success or failure).

    Note: caller is responsible for checking ``user.notify_on_completion``
    before calling this — keeps preference handling in one place.
    """
    if failed:
        title = "Transcription failed"
        body = f"“{display_name}” could not be transcribed."
        if error:
            body += f" Error: {error}"
        ntype = "transcription_failed"
    else:
        title = "Transcription ready"
        body = f"“{display_name}” is ready to view."
        ntype = "transcription_completed"

    return await create_notification(
        db,
        user_id=user_id,
        type=ntype,
        title=title,
        body=body,
        link=f"/transcriptions/{transcription_id}",
        commit=commit,
    )

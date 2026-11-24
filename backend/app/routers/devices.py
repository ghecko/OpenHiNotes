from fastapi import APIRouter, Depends, HTTPException, Path as PathParam, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime
from typing import List
from app.database import get_db
from app.dependencies import get_current_user
from app.models.transcription import Transcription
from app.models.user import User
from app.models.user_device import UserDevice
from app.schemas.device import DeviceFilesUpdate, DeviceFilesResult, DeviceRename, UserDeviceResponse

router = APIRouter(prefix="/devices", tags=["devices"])

_IN_CHUNK = 500


async def _list_devices(db: AsyncSession, user: User) -> List[UserDevice]:
    result = await db.execute(
        select(UserDevice).where(UserDevice.user_id == user.id).order_by(UserDevice.created_at)
    )
    return list(result.scalars().all())


@router.get("", response_model=List[UserDeviceResponse])
async def list_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """The HiDocks this user has connected, with the files each held when last seen."""
    return await _list_devices(db, current_user)


async def _get_or_create(db: AsyncSession, user: User, serial: str) -> UserDevice:
    device = (await db.execute(
        select(UserDevice).where(UserDevice.user_id == user.id, UserDevice.serial == serial)
    )).scalars().first()
    if device is None:
        device = UserDevice(user_id=user.id, serial=serial)
        db.add(device)
    return device


@router.patch("/{serial}", response_model=List[UserDeviceResponse])
async def rename_device(
    payload: DeviceRename,
    serial: str = PathParam(..., min_length=1, max_length=64),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Give one of the user's devices a name (empty = back to the model name)."""
    serial = serial.strip()
    if not serial:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty device serial")
    device = await _get_or_create(db, current_user, serial)
    model = (payload.model or "").strip() or None
    if model and not device.model:
        device.model = model
    device.name = (payload.name or "").strip() or None
    await db.commit()
    return await _list_devices(db, current_user)


@router.put("/{serial}/files", response_model=DeviceFilesResult)
async def report_device_files(
    payload: DeviceFilesUpdate,
    serial: str = PathParam(..., min_length=1, max_length=64),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record the file list a connected device returned.

    Also stamps this device as the origin of the user's transcriptions that
    have none yet and whose source file is in the list (rows created before
    origins were recorded). A transcription that already has an origin is
    left alone, as are combined ones (their audio never lived on a device).
    """
    serial = serial.strip()
    if not serial:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty device serial")
    model = (payload.model or "").strip() or None
    names = sorted({n.strip()[:255] for n in payload.filenames if n and n.strip()})

    device = await _get_or_create(db, current_user, serial)
    if model:
        device.model = model
    device.file_names = names
    device.files_seen_at = datetime.utcnow()

    claimed = 0
    for i in range(0, len(names), _IN_CHUNK):
        rows = (await db.execute(
            select(Transcription.id, Transcription.combined_sources).where(
                Transcription.user_id == current_user.id,
                Transcription.source_device_serial.is_(None),
                Transcription.original_filename.in_(names[i:i + _IN_CHUNK]),
            )
        )).all()
        ids = [row[0] for row in rows if not row[1]]
        if not ids:
            continue
        await db.execute(
            update(Transcription)
            .where(Transcription.id.in_(ids))
            # updated_at is passed through so stamping does not look like an edit
            .values(source_kind="device", source_device_serial=serial, source_device_model=device.model,
                    updated_at=Transcription.updated_at)
            .execution_options(synchronize_session=False)
        )
        claimed += len(ids)

    await db.commit()
    return DeviceFilesResult(
        devices=[UserDeviceResponse.model_validate(d) for d in await _list_devices(db, current_user)],
        claimed=claimed,
    )

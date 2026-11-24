"""Which HiDock a recording came from, and what each device held last time.

Alice owns an H1 and a P1. Rows that predate origin tracking are stamped when
a device that lists their file is connected; rows that already have an
origin, combined rows and other users' rows are left alone.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

pytest.importorskip("aiosqlite")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
import app.models  # noqa: E402,F401
from app.dependencies import get_current_user  # noqa: E402
from app.models.transcription import Transcription  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routers import devices as devices_router, transcriptions as transcriptions_router  # noqa: E402
from app.services.transcription import TranscriptionService  # noqa: E402

H1, P1 = "H1SERIAL0001", "P1SERIAL0002"


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/t.db", poolclass=NullPool)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with maker() as db:
            users = {n: User(email=f"{n}@example.com", hashed_password="x", display_name=n)
                     for n in ("alice", "bob")}
            db.add_all(users.values())
            await db.flush()

            def t(owner, name, **kw):
                return Transcription(user_id=users[owner].id, filename=name, original_filename=name, **kw)
            db.add_all([
                t("alice", "legacy-on-h1.hda"),
                t("alice", "legacy-on-p1.hda"),
                t("alice", "legacy-gone.hda"),
                t("alice", "stamped-p1.hda", source_device_serial=P1, source_device_model="hidock-p1"),
                t("alice", "combined.wav", combined_sources=["legacy-on-h1.hda", "x.hda"]),
                t("bob", "legacy-on-h1.hda"),
            ])
            await db.commit()
            return users

    users = asyncio.run(setup())

    app = FastAPI()
    app.include_router(devices_router.router, prefix="/api")
    app.include_router(transcriptions_router.router, prefix="/api")

    async def db_dep():
        async with maker() as db:
            yield db
    who = {"user": users["alice"]}
    app.dependency_overrides[get_db] = db_dep
    app.dependency_overrides[get_current_user] = lambda: who["user"]

    def origins(owner="alice"):
        async def run():
            async with maker() as db:
                rows = (await db.execute(
                    select(Transcription.original_filename, Transcription.source_device_serial,
                           Transcription.source_device_model)
                    .where(Transcription.user_id == users[owner].id))).all()
                return {r[0]: (r[1], r[2]) for r in rows}
        return asyncio.run(run())

    def kinds():
        async def run():
            async with maker() as db:
                rows = (await db.execute(
                    select(Transcription.original_filename, Transcription.source_kind)
                    .where(Transcription.user_id == users["alice"].id))).all()
                return {r[0]: r[1] for r in rows}
        return asyncio.run(run())

    client = TestClient(app)

    def as_user(name):
        who["user"] = users[name]
        return client

    yield type("Env", (), {"client": client, "as_user": staticmethod(as_user),
                           "origins": staticmethod(origins), "kinds": staticmethod(kinds),
                           "monkeypatch": monkeypatch})
    asyncio.run(engine.dispose())


def test_reporting_a_file_list_stamps_only_unclaimed_own_rows(env):
    r = env.client.put(f"/api/devices/{H1}/files", json={
        "model": "hidock-h1",
        # stamped-p1 also "appears" on the H1 (same name): its origin must not change
        "filenames": ["legacy-on-h1.hda", "stamped-p1.hda", "combined.wav", "never-transcribed.hda"],
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["claimed"] == 1
    assert [d["serial"] for d in body["devices"]] == [H1]
    assert "never-transcribed.hda" in body["devices"][0]["file_names"]

    o = env.origins()
    assert o["legacy-on-h1.hda"] == (H1, "hidock-h1")
    assert o["legacy-on-p1.hda"] == (None, None)
    assert o["legacy-gone.hda"] == (None, None)
    assert o["stamped-p1.hda"] == (P1, "hidock-p1")
    assert o["combined.wav"] == (None, None)
    k = env.kinds()
    assert k["legacy-on-h1.hda"] == "device" and k["legacy-gone.hda"] is None
    # Bob has a recording with the same file name: not Alice's device, not touched
    assert env.origins("bob")["legacy-on-h1.hda"] == (None, None)


def test_second_device_and_relisting(env):
    env.client.put(f"/api/devices/{H1}/files", json={"model": "hidock-h1", "filenames": ["legacy-on-h1.hda"]})
    r = env.client.put(f"/api/devices/{P1}/files", json={"model": "hidock-p1", "filenames": ["legacy-on-p1.hda"]})
    assert r.json()["claimed"] == 1
    assert env.origins()["legacy-on-p1.hda"] == (P1, "hidock-p1")

    # The H1 is listed again after the file was deleted from it: the list is
    # replaced, nothing is claimed twice, and the origin stays.
    r = env.client.put(f"/api/devices/{H1}/files", json={"model": "hidock-h1", "filenames": []})
    assert r.json()["claimed"] == 0
    devices = {d["serial"]: d for d in env.client.get("/api/devices").json()}
    assert set(devices) == {H1, P1}
    assert devices[H1]["file_names"] == [] and devices[H1]["files_seen_at"]
    assert devices[P1]["file_names"] == ["legacy-on-p1.hda"]
    assert env.origins()["legacy-on-h1.hda"] == (H1, "hidock-h1")

    # Devices are per user
    assert env.as_user("bob").get("/api/devices").json() == []


def test_origin_is_returned_and_recorded_at_upload(env):
    async def fake_save(file, user_id):
        return "stored.hda", file.filename

    async def fake_enqueue(_id):
        return 1
    from app.services.queue import transcription_queue
    env.monkeypatch.setattr(TranscriptionService, "save_uploaded_file", staticmethod(fake_save))
    env.monkeypatch.setattr(transcription_queue, "enqueue", fake_enqueue)

    r = env.client.post(
        "/api/transcriptions/queue",
        files={"file": ("new-on-p1.hda", b"x", "audio/wav")},
        data={"source_device_serial": f" {P1} ", "source_device_model": "hidock-p1"},
    )
    assert r.status_code == 202, r.text
    assert r.json()["source_device_serial"] == P1
    assert r.json()["source_device_model"] == "hidock-p1"
    assert r.json()["source_kind"] == "device"

    # Web upload: no origin, and a model alone is not an origin
    r = env.client.post(
        "/api/transcriptions/queue",
        files={"file": ("meeting.mp3", b"x", "audio/mpeg")},
        data={"source_device_model": "hidock-p1", "source_kind": "upload"},
    )
    assert r.status_code == 202, r.text
    assert r.json()["source_device_serial"] is None and r.json()["source_device_model"] is None
    assert r.json()["source_kind"] == "upload"

    # Recorded in the browser; an unknown kind is dropped, a serial wins over the kind
    post = lambda name, data: env.client.post(  # noqa: E731
        "/api/transcriptions/queue", files={"file": (name, b"x", "audio/webm")}, data=data).json()
    assert post("recording-1.webm", {"source_kind": "recording"})["source_kind"] == "recording"
    assert post("x.webm", {"source_kind": "whatever"})["source_kind"] is None
    assert post("y.hda", {"source_kind": "upload", "source_device_serial": H1})["source_kind"] == "device"


def test_naming_a_device(env):
    env.client.put(f"/api/devices/{P1}/files", json={"model": "hidock-p1", "filenames": ["p.hda"]})
    r = env.client.patch(f"/api/devices/{P1}", json={"name": "  Pocket P1 "})
    assert r.status_code == 200, r.text
    assert r.json()[0]["name"] == "Pocket P1" and r.json()[0]["file_names"] == ["p.hda"]

    # A device that was never listed can be named too: the row is created
    r = env.client.patch(f"/api/devices/{H1}", json={"name": "Desk", "model": "hidock-h1"})
    by = {d["serial"]: d for d in r.json()}
    assert by[H1]["name"] == "Desk" and by[H1]["model"] == "hidock-h1" and by[H1]["files_seen_at"] is None

    # Listing files keeps the name; an empty name removes it
    env.client.put(f"/api/devices/{P1}/files", json={"model": "hidock-p1", "filenames": []})
    by = {d["serial"]: d for d in env.client.patch(f"/api/devices/{H1}", json={"name": ""}).json()}
    assert by[P1]["name"] == "Pocket P1" and by[H1]["name"] is None
    assert env.client.patch(f"/api/devices/{P1}", json={"name": "x" * 61}).status_code == 422
    assert env.as_user("bob").get("/api/devices").json() == []

"""A transcription in several collections, and who can see it through them.

Scenario: Alice owns transcription T and filed it in her collection "Alice"
(shared with Carol). T is shared with Bob (write), who files it in his own
collection "Bob", shared with Dave. Dave must not get access to T that way.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

pytest.importorskip("aiosqlite")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event, select  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
import app.models  # noqa: E402,F401
from app.dependencies import get_current_user  # noqa: E402
from app.models.collection import Collection  # noqa: E402
from app.models.collection_transcription import CollectionTranscription  # noqa: E402
from app.models.resource_share import ResourceShare, ResourceType, GranteeType, PermissionLevel  # noqa: E402
from app.models.transcription import Transcription  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routers import collections as collections_router, transcriptions as transcriptions_router  # noqa: E402
from app.services.permissions import PermissionService  # noqa: E402


@pytest.fixture
def env(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/t.db", poolclass=NullPool)

    @event.listens_for(engine.sync_engine, "connect")
    def _fk_on(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with maker() as db:
            users = {n: User(email=f"{n}@example.com", hashed_password="x", display_name=n)
                     for n in ("alice", "bob", "carol", "dave")}
            db.add_all(users.values())
            await db.flush()
            colls = {
                "alice": Collection(user_id=users["alice"].id, name="Alice"),
                "bob": Collection(user_id=users["bob"].id, name="Bob"),
            }
            db.add_all(colls.values())
            t = Transcription(user_id=users["alice"].id, filename="t", original_filename="t.mp3")
            db.add(t)
            await db.flush()
            db.add(CollectionTranscription(collection_id=colls["alice"].id, transcription_id=t.id,
                                           added_by_id=users["alice"].id))

            def share(rtype, rid, grantee, level, by):
                return ResourceShare(resource_type=rtype, resource_id=rid, grantee_type=GranteeType.user,
                                     grantee_id=users[grantee].id, permission=level, granted_by=users[by].id)
            db.add_all([
                share(ResourceType.transcription, t.id, "bob", PermissionLevel.write, "alice"),
                share(ResourceType.collection, colls["alice"].id, "carol", PermissionLevel.read, "alice"),
                share(ResourceType.collection, colls["bob"].id, "dave", PermissionLevel.read, "bob"),
            ])
            await db.commit()
            return users, colls, t

    users, colls, t = asyncio.run(setup())

    app = FastAPI()
    app.include_router(collections_router.router, prefix="/api")
    app.include_router(transcriptions_router.router, prefix="/api")

    async def db_dep():
        async with maker() as db:
            yield db
    who = {"user": users["alice"]}
    app.dependency_overrides[get_db] = db_dep
    app.dependency_overrides[get_current_user] = lambda: who["user"]

    def as_user(name):
        who["user"] = users[name]
        return client

    def level(name):
        async def run():
            async with maker() as db:
                return await PermissionService.get_permission_level(db, users[name], ResourceType.transcription, t.id)
        return asyncio.run(run())

    def memberships():
        async def run():
            async with maker() as db:
                rows = (await db.execute(select(CollectionTranscription))).scalars().all()
                return {(r.collection_id, r.added_by_id) for r in rows}
        return asyncio.run(run())

    client = TestClient(app)
    yield dict(users=users, colls=colls, t=t, as_user=as_user, level=level, memberships=memberships)
    asyncio.run(engine.dispose())


def _names(response):
    assert response.status_code == 200, response.text
    return [i["original_filename"] for i in response.json()["items"]]


def test_shared_transcription_goes_into_own_collection_without_reshare(env):
    t, colls, users = env["t"], env["colls"], env["users"]
    bob = env["as_user"]("bob")
    r = bob.patch(f"/api/collections/{colls['bob'].id}/transcriptions/{t.id}")
    assert r.status_code == 200, r.text
    # Still in Alice's collection: Bob filed it for himself only.
    assert env["memberships"]() == {(colls["alice"].id, users["alice"].id), (colls["bob"].id, users["bob"].id)}
    # Carol reads it through Alice's collection; Dave gets nothing through Bob's.
    assert env["level"]("carol") == "read"
    assert env["level"]("dave") is None

    dave = env["as_user"]("dave")
    assert dave.get(f"/api/collections/{colls['bob'].id}/transcriptions").json() == []
    counts = {c["id"]: c["transcription_count"] for c in dave.get("/api/collections").json()}
    assert counts == {str(colls["bob"].id): 0}

    bob = env["as_user"]("bob")
    listed = bob.get(f"/api/collections/{colls['bob'].id}/transcriptions").json()
    assert [x["id"] for x in listed] == [str(t.id)]
    assert set(listed[0]["collection_ids"]) == {str(colls["alice"].id), str(colls["bob"].id)}


def test_read_access_is_enough_to_file_it(env):
    t, colls = env["t"], env["colls"]
    carol = env["as_user"]("carol")
    mine = carol.post("/api/collections", json={"name": "Carol"}).json()
    r = carol.patch(f"/api/collections/{mine['id']}/transcriptions/{t.id}")
    assert r.status_code == 200, r.text
    # But not into a collection Carol cannot edit.
    r = carol.patch(f"/api/collections/{colls['alice'].id}/transcriptions/{t.id}")
    assert r.status_code == 403
    # Dave cannot read T at all.
    dave = env["as_user"]("dave")
    r = dave.patch(f"/api/collections/{colls['bob'].id}/transcriptions/{t.id}")
    assert r.status_code == 403


def test_list_filter_per_viewer(env):
    t, colls = env["t"], env["colls"]
    env["as_user"]("bob").patch(f"/api/collections/{colls['bob'].id}/transcriptions/{t.id}")
    bob = env["as_user"]("bob")
    assert _names(bob.get(f"/api/transcriptions?collection_id={colls['bob'].id}")) == ["t.mp3"]
    assert _names(bob.get("/api/transcriptions?collection_id=none")) == []
    alice = env["as_user"]("alice")
    assert _names(alice.get(f"/api/transcriptions?collection_id={colls['alice'].id}")) == ["t.mp3"]
    # Bob's collection is invisible to Alice: filtering on it shows nothing.
    assert _names(alice.get(f"/api/transcriptions?collection_id={colls['bob'].id}")) == []
    env["as_user"]("alice").delete(f"/api/collections/{colls['alice'].id}/transcriptions/{t.id}")
    assert _names(env["as_user"]("alice").get("/api/transcriptions?collection_id=none")) == ["t.mp3"]


def test_who_can_take_it_out(env):
    t, colls = env["t"], env["colls"]
    env["as_user"]("bob").patch(f"/api/collections/{colls['bob'].id}/transcriptions/{t.id}")
    # Dave only reads Bob's collection.
    assert env["as_user"]("dave").delete(f"/api/collections/{colls['bob'].id}/transcriptions/{t.id}").status_code == 403
    # Alice owns the transcription: she may take it out of Bob's collection.
    assert env["as_user"]("alice").delete(f"/api/collections/{colls['bob'].id}/transcriptions/{t.id}").status_code == 200


def test_batch_add_and_remove(env):
    t, colls = env["t"], env["colls"]
    bob = env["as_user"]("bob")
    r = bob.post("/api/transcriptions/batch/collection", json={"ids": [str(t.id)], "collection_id": str(colls["bob"].id)})
    assert r.json()["affected"] == 1
    # Adding twice is a no-op, not a duplicate.
    bob.post("/api/transcriptions/batch/collection", json={"ids": [str(t.id)], "collection_id": str(colls["bob"].id)})
    assert len(env["memberships"]()) == 2
    r = bob.post("/api/transcriptions/batch/collection",
                 json={"ids": [str(t.id)], "collection_id": str(colls["bob"].id), "remove": True})
    assert r.json()["affected"] == 1
    # Bob cannot pull it out of Alice's collection.
    r = bob.post("/api/transcriptions/batch/collection",
                 json={"ids": [str(t.id)], "collection_id": str(colls["alice"].id), "remove": True})
    assert r.json()["affected"] == 0 and r.json()["skipped"] == 1
    assert len(env["memberships"]()) == 1


def test_deleting_the_transcription_drops_memberships(env):
    t = env["t"]
    assert env["as_user"]("alice").delete(f"/api/transcriptions/{t.id}").status_code == 204
    assert env["memberships"]() == set()

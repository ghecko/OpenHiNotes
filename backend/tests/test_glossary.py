"""Vocabulary (glossary): scoping, LLM prompt block, VoxHub context_bias fields."""
import asyncio
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from app.models.glossary import GlossaryTerm  # noqa: E402
from app.services import glossary  # noqa: E402
from app.services.transcription import TranscriptionService  # noqa: E402


def _term(term, aliases=(), collection_id=None, user_id=None):
    return GlossaryTerm(
        id=uuid.uuid4(), user_id=user_id or uuid.uuid4(), collection_id=collection_id,
        term=term, aliases=list(aliases),
    )


def test_normalize_aliases_dedupes_and_drops_the_term():
    assert glossary.normalize_aliases("VoxHub", ["Voxub", " voxub ", "VoxHub", "", "Vox  Sub"]) == ["Voxub", "Vox Sub"]


def test_prompt_block_lists_terms_and_heard_as_variants():
    block = glossary.prompt_block([_term("VoxHub", ["Voxub", "VoxSub"]), _term("Burp Suite")])
    assert "- VoxHub (heard as: Voxub, VoxSub)" in block
    assert "- Burp Suite" in block
    assert "variants not listed" in block


def test_prompt_block_empty():
    assert glossary.prompt_block([]) is None


def test_bias_terms_are_bare_and_capped():
    terms = [_term(f"t{i}", ["x"]) for i in range(glossary.MAX_BIAS_TERMS + 5)]
    bias = glossary.bias_terms(terms)
    assert len(bias) == glossary.MAX_BIAS_TERMS and bias[0] == "t0"


def test_context_bias_sent_only_when_enabled():
    cfg = {"model": "voxtral:mini-3b", "context_bias": False}
    data = TranscriptionService._build_request_data(cfg, None, True, None, ["WriteHat"])
    assert "context_bias" not in data
    cfg["context_bias"] = True
    data = TranscriptionService._build_request_data(cfg, None, True, None, ["WriteHat", "Burp Suite"])
    assert data["context_bias"] == ["WriteHat", "Burp Suite"]
    assert "context_bias" not in TranscriptionService._build_request_data(cfg, None, True, None, [])


@pytest.fixture
def db_session():
    pytest.importorskip("aiosqlite")
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    import app.models  # noqa: F401  (registers every table)

    async def make():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        return engine, async_sessionmaker(engine, expire_on_commit=False)

    engine, maker = asyncio.run(make())
    yield maker
    asyncio.run(engine.dispose())


def test_terms_for_merges_general_and_collection(db_session):
    from app.models.user import User
    from app.models.collection import Collection

    async def scenario():
        async with db_session() as db:
            alice = User(email="a@example.com", hashed_password="x", display_name="Alice")
            bob = User(email="b@example.com", hashed_password="x", display_name="Bob")
            db.add_all([alice, bob])
            await db.flush()
            pentest = Collection(user_id=alice.id, name="Pentest")
            other = Collection(user_id=alice.id, name="Other")
            db.add_all([pentest, other])
            await db.flush()
            db.add_all([
                GlossaryTerm(user_id=alice.id, term="VoxHub", aliases=["Voxub"]),
                GlossaryTerm(user_id=alice.id, term="writehat", aliases=[]),
                GlossaryTerm(user_id=alice.id, collection_id=pentest.id, term="WriteHat", aliases=["right hat"]),
                GlossaryTerm(user_id=alice.id, collection_id=pentest.id, term="Burp Suite", aliases=[]),
                GlossaryTerm(user_id=alice.id, collection_id=other.id, term="Kubernetes", aliases=[]),
                GlossaryTerm(user_id=bob.id, term="BobTerm", aliases=[]),
            ])
            await db.commit()

            in_pentest = await glossary.terms_for(db, alice.id, pentest.id)
            general_only = await glossary.terms_for(db, alice.id, None)
            return [t.term for t in in_pentest], [t.term for t in general_only]

    in_pentest, general_only = asyncio.run(scenario())
    # Collection terms first; the general "writehat" is shadowed by the collection's "WriteHat".
    assert in_pentest == ["Burp Suite", "WriteHat", "VoxHub"]
    assert general_only == ["VoxHub", "writehat"]

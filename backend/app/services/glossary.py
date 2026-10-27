"""Vocabulary (glossary) of terms the speech recognizer tends to get wrong.

The vocabulary of a transcription is the general one of its owner plus the
ones of its collections. It is used two ways:

* LLM prompts (summaries, chat): the model is told the correct spellings and
  the mis-transcriptions seen so far, and restores the right term even for
  variants nobody has seen yet. This is safer than rewriting transcripts
  with alias → term rules, which would turn legitimate words into the term.
* VoxHub ``context_bias`` (opt-in admin setting): the bare terms, for a
  transcription backend that supports biasing (Mistral's Voxtral Transcribe
  models do; the open Voxtral-Mini-3B-2507 does not).
"""

import uuid
from typing import Iterable, Optional

from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.glossary import GlossaryTerm
from app.models.collection_transcription import CollectionTranscription

# Bounds so a large vocabulary cannot crowd out the transcript in the
# context window. Collection terms come first: they are the most specific.
MAX_PROMPT_TERMS = 200
MAX_ALIASES_PER_TERM = 8
# Mistral documents no fixed count for context_bias, but the entries share
# the context window with the audio (oversized requests fail with a 400).
MAX_BIAS_TERMS = 100


def normalize_aliases(term: str, aliases: list[str]) -> list[str]:
    """Trimmed, de-duplicated (case-insensitively) aliases, without the term itself."""
    seen = {term.strip().casefold()}
    result = []
    for alias in aliases:
        alias = " ".join(alias.split())
        if alias and alias.casefold() not in seen:
            seen.add(alias.casefold())
            result.append(alias)
    return result


async def terms_for(
    db: AsyncSession,
    owner_ids: Iterable[uuid.UUID],
    collection_ids: Iterable[uuid.UUID] = (),
) -> list[GlossaryTerm]:
    """General terms of ``owner_ids`` plus the terms of ``collection_ids``.

    Collection terms come first; a term spelled like an earlier one is
    dropped (the collection one is the more specific).
    """
    owner_ids, collection_ids = list(owner_ids), list(collection_ids)
    scope = and_(GlossaryTerm.user_id.in_(owner_ids), GlossaryTerm.collection_id.is_(None))
    if collection_ids:
        scope = or_(scope, GlossaryTerm.collection_id.in_(collection_ids))
    rows = (await db.execute(select(GlossaryTerm).where(scope).order_by(GlossaryTerm.term))).scalars().all()
    ordered = [t for t in rows if t.collection_id] + [t for t in rows if not t.collection_id]
    seen: set[str] = set()
    result = []
    for t in ordered:
        key = t.term.casefold()
        if key not in seen:
            seen.add(key)
            result.append(t)
    return result


async def terms_for_transcription(db: AsyncSession, transcription) -> list[GlossaryTerm]:
    """Owner's general terms + the collections the owner filed it in.

    For what everyone shares (summaries, transcription biasing); someone it
    was shared with may have filed it in collections of their own, whose
    vocabulary only applies to their own chats.
    """
    owner_collections = (await db.execute(
        select(CollectionTranscription.collection_id).where(
            CollectionTranscription.transcription_id == transcription.id,
            CollectionTranscription.added_by_id == transcription.user_id,
        )
    )).scalars().all()
    return await terms_for(db, [transcription.user_id], owner_collections)


def prompt_block(terms: list[GlossaryTerm]) -> Optional[str]:
    """Instructions telling the LLM how to use the vocabulary, or None if empty."""
    if not terms:
        return None
    lines = []
    for t in terms[:MAX_PROMPT_TERMS]:
        aliases = (t.aliases or [])[:MAX_ALIASES_PER_TERM]
        if aliases:
            lines.append(f"- {t.term} (heard as: {', '.join(aliases)})")
        else:
            lines.append(f"- {t.term}")
    return (
        "The transcript comes from automatic speech recognition, which often misspells "
        "the domain terms below. Wherever the transcript contains a word or phrase that "
        "sounds like one of them (including variants not listed), treat it as that term "
        "and always write it with the spelling given here. Do not mention these "
        "corrections unless asked.\n\nVocabulary:\n" + "\n".join(lines)
    )


def bias_terms(terms: list[GlossaryTerm]) -> list[str]:
    """Bare terms for VoxHub's ``context_bias``."""
    return [t.term for t in terms[:MAX_BIAS_TERMS]]

"""Unit tests for word timing carry-over on manual edits (no DB needed)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.word_realign import realign_words, segment_confidence  # noqa: E402


def _w(tokens, start=0.0, step=0.5, score=0.9):
    return [
        {"word": t, "start": round(start + i * step, 3), "end": round(start + (i + 1) * step, 3), "score": score}
        for i, t in enumerate(tokens)
    ]


def test_single_word_substitution_keeps_timings():
    words = _w(["bonjour", "Fabien,", "ça", "va", "?"])
    out = realign_words(words, "bonjour Fabian, ça va ?")
    assert [w["word"] for w in out] == ["bonjour", "Fabian,", "ça", "va", "?"]
    assert out[1]["start"] == 0.5 and out[1]["end"] == 1.0 and out[1]["score"] == 1.0
    assert out[0] == words[0] and out[4] == words[4]


def test_insert_and_delete():
    words = _w(["on", "commence", "maintenant"])
    out = realign_words(words, "on commence tout de suite maintenant")
    assert [w["word"] for w in out] == ["on", "commence", "tout", "de", "suite", "maintenant"]
    # inserted words sit between "commence" (ends 1.0) and "maintenant" (starts 1.0): kept ordered
    assert out[2]["start"] >= 1.0 and out[5]["start"] >= out[4]["end"]
    out = realign_words(words, "on maintenant")
    assert [w["word"] for w in out] == ["on", "maintenant"] and out[1]["start"] == 1.0


def test_unequal_replace_spreads_span():
    words = _w(["il", "a", "dit", "quatre", "vingt", "dix", "euros"])
    out = realign_words(words, "il a dit 90 euros")
    assert [w["word"] for w in out] == ["il", "a", "dit", "90", "euros"]
    assert out[3]["start"] == 1.5 and out[3]["end"] == 3.0 and out[6 - 2]["word"] == "euros"


def test_empty_cases_and_confidence():
    assert realign_words(None, "x") is None
    assert realign_words(_w(["a"]), "   ") is None
    assert segment_confidence(_w(["a", "b"], score=0.5), 0.1) == 0.5
    assert segment_confidence([], 0.1) == 0.1

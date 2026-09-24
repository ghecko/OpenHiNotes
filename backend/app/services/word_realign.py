"""Keep per-word timestamps across manual text edits.

A transcript edit usually touches one or two words (a name, a typo). Dropping
the whole ``words`` list of the segment would lose the karaoke highlight and
the split-before-word feature for that segment, so instead the new text is
diffed against the old words and timings are carried over:

* unchanged words keep their timing and alignment score;
* a word replaced by a word gets the old timing (score 1.0: human-verified);
* N old words replaced by M new words share the old time span evenly;
* inserted words are squeezed between their neighbours;
* deleted words vanish.

Only whitespace-separated tokens are compared, punctuation included, so
"c'est ça ?" stays one token per word exactly like the aligner produced it.
"""

from __future__ import annotations

import difflib
from typing import Dict, List, Optional


def _spread(tokens: List[str], start: float, end: float, score: Optional[float]) -> List[Dict]:
    n = len(tokens)
    if end < start:
        end = start
    step = (end - start) / n if n else 0.0
    return [
        {
            "word": tok,
            "start": round(start + i * step, 3),
            "end": round(start + (i + 1) * step, 3),
            "score": score,
        }
        for i, tok in enumerate(tokens)
    ]


def realign_words(words: Optional[List[Dict]], new_text: str,
                  seg_start: Optional[float] = None, seg_end: Optional[float] = None) -> Optional[List[Dict]]:
    """Return a ``words`` list matching *new_text*, or ``None`` when nothing usable remains."""
    if not words:
        return None
    new_tokens = new_text.split()
    if not new_tokens:
        return None
    old_tokens = [str(w.get("word", "")) for w in words]
    lo = seg_start if seg_start is not None else words[0]["start"]
    hi = seg_end if seg_end is not None else words[-1]["end"]

    out: List[Dict] = []
    sm = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            out.extend(dict(words[k]) for k in range(i1, i2))
        elif tag == "delete":
            continue
        elif tag == "replace":
            start, end = words[i1]["start"], words[i2 - 1]["end"]
            if i2 - i1 == j2 - j1:
                # word-for-word substitution: keep each old timing
                for k, j in zip(range(i1, i2), range(j1, j2)):
                    out.append({**words[k], "word": new_tokens[j], "score": 1.0})
            else:
                out.extend(_spread(new_tokens[j1:j2], start, end, 1.0))
        elif tag == "insert":
            left = out[-1]["end"] if out else lo
            right = words[i1]["start"] if i1 < len(words) else hi
            if right <= left:
                # no room between neighbours: borrow a sliver so the words stay ordered
                right = left + 0.05 * (j2 - j1)
            out.extend(_spread(new_tokens[j1:j2], left, right, 1.0))
    # keep monotonic order (an insert may have been pushed past the next word)
    for k in range(1, len(out)):
        if out[k]["start"] < out[k - 1]["end"]:
            out[k]["start"] = out[k - 1]["end"]
            if out[k]["end"] < out[k]["start"]:
                out[k]["end"] = out[k]["start"]
    return out


def segment_confidence(words: Optional[List[Dict]], fallback: Optional[float]) -> Optional[float]:
    scores = [w.get("score") for w in (words or []) if w.get("score") is not None]
    return round(sum(scores) / len(scores), 3) if scores else fallback

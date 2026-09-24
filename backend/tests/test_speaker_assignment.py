"""Unit tests for the 1:1 speaker → user assignment (no DB needed)."""
import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.speaker_identification import assign_speakers_to_profiles  # noqa: E402


def _emb(seed, dim=8):
    import numpy as np
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim)
    return (v / np.linalg.norm(v)).tolist()


def _noisy(vec, eps, seed):
    import numpy as np
    rng = np.random.default_rng(seed)
    v = np.array(vec) + eps * rng.normal(size=len(vec))
    return (v / np.linalg.norm(v)).tolist()


ALICE, BOB = uuid.uuid4(), uuid.uuid4()
P_ALICE, P_ALICE2, P_BOB = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
alice_voice, bob_voice = _emb(1), _emb(2)
PROFILES = [
    (P_ALICE, ALICE, "Alice", "My voice", alice_voice),
    (P_ALICE2, ALICE, "Alice", "Laptop mic", _noisy(alice_voice, 0.2, 10)),
    (P_BOB, BOB, "Bob", "My voice", bob_voice),
]


def test_each_user_is_assigned_at_most_once():
    # Both diarized speakers are closest to Alice; the second-best for
    # SPEAKER_01 is Bob and must win the 1:1 assignment.
    s0 = _noisy(alice_voice, 0.05, 20)                 # clearly Alice
    s1 = _noisy([0.7 * a + 0.5 * b for a, b in zip(alice_voice, bob_voice)], 0.05, 21)
    res = assign_speakers_to_profiles(
        {"SPEAKER_00": {"embedding": s0}, "SPEAKER_01": {"embedding": s1}}, PROFILES, threshold=0.6
    )
    by = {r.speaker_label: r for r in res}
    assert by["SPEAKER_00"].matched_display_name == "Alice"
    assert by["SPEAKER_00"].matched_profile_id == P_ALICE
    assert by["SPEAKER_01"].matched_display_name == "Bob"


def test_threshold_and_unmatched_distance():
    stranger = _emb(99)
    res = assign_speakers_to_profiles({"SPEAKER_00": {"embedding": stranger}}, PROFILES, threshold=0.3)
    assert res[0].matched_user_id is None
    assert res[0].distance is not None and res[0].distance >= 0.3


def test_dimension_mismatch_is_ignored_and_empty_embedding_kept():
    res = assign_speakers_to_profiles(
        {"SPEAKER_00": {"embedding": _emb(1, dim=4)}, "SPEAKER_01": {"embedding": []}}, PROFILES, threshold=0.9
    )
    assert [r.matched_user_id for r in res] == [None, None]
    assert [r.speaker_label for r in res] == ["SPEAKER_00", "SPEAKER_01"]

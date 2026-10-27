"""Unit tests for the VoxHub free-memory call and the bulk settings validation (no DB needed)."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import transcription as tr  # noqa: E402
from app.services.transcription import TranscriptionService  # noqa: E402


class _Resp:
    def __init__(self, status, body=None):
        self.status_code, self._body, self.text = status, body or {}, ""

    def json(self):
        return self._body


def _patch_client(monkeypatch, resp=None, exc=None, calls=None):
    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None):
            if calls is not None:
                calls.append((url, headers))
            if exc:
                raise exc
            return resp

    monkeypatch.setattr(tr.httpx, "AsyncClient", _Client)


def _cfg(monkeypatch, enabled):
    async def fake(db=None):
        return {"api_url": "http://vox:8000", "api_key": "k", "free_after_queue": enabled}

    monkeypatch.setattr(TranscriptionService, "_resolve_transcription_settings", staticmethod(fake))


def test_skipped_when_disabled(monkeypatch):
    calls = []
    _cfg(monkeypatch, False)
    _patch_client(monkeypatch, _Resp(200, {"status": "success"}), calls=calls)
    assert asyncio.run(TranscriptionService.free_voxhub_resources(None)) is None
    assert calls == []


def test_calls_models_free_when_enabled(monkeypatch):
    calls = []
    _cfg(monkeypatch, True)
    _patch_client(monkeypatch, _Resp(200, {"status": "success", "freed": ["aligner"]}), calls=calls)
    out = asyncio.run(TranscriptionService.free_voxhub_resources(None))
    assert out["freed"] == ["aligner"]
    assert calls == [("http://vox:8000/models/free", {"Authorization": "Bearer k"})]


@pytest.mark.parametrize("status", [404, 409, 500])
def test_non_200_is_ignored(monkeypatch, status):
    _cfg(monkeypatch, True)
    _patch_client(monkeypatch, _Resp(status))
    assert asyncio.run(TranscriptionService.free_voxhub_resources(None)) is None


def test_network_error_never_raises(monkeypatch):
    _cfg(monkeypatch, True)
    _patch_client(monkeypatch, exc=RuntimeError("down"))
    assert asyncio.run(TranscriptionService.free_voxhub_resources(None)) is None


def test_force_overrides_setting(monkeypatch):
    _cfg(monkeypatch, False)
    _patch_client(monkeypatch, _Resp(200, {"freed": []}))
    assert asyncio.run(TranscriptionService.free_voxhub_resources(None, force=True)) == {"freed": []}


def test_free_setting_is_configurable():
    from app.routers.app_settings import CONFIGURABLE_KEYS
    assert "voxhub_free_after_queue" in CONFIGURABLE_KEYS

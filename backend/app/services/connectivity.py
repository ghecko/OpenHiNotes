"""Connectivity checks for the external services OpenHiNotes depends on.

Used by the admin "Test connection" buttons and to turn low-level httpx
errors into messages an admin can act on ("DNS resolution failed for
host X" instead of "[Errno -2] Name or service not known").
"""

import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx


def _host_of(url: str) -> str:
    try:
        return urlparse(url).hostname or url
    except Exception:
        return url


def describe_http_error(exc: BaseException, url: str) -> tuple[str, Optional[str]]:
    """Return (message, hint) for an httpx error against ``url``.

    The message says what failed; the hint says what to look at. Both are
    written for the admin, who only sees the backend from the outside.
    """
    host = _host_of(url)
    msg = str(exc) or exc.__class__.__name__

    if isinstance(exc, httpx.ConnectError):
        lowered = msg.lower()
        if (
            "name or service not known" in lowered
            or "nodename nor servname" in lowered
            or "temporary failure in name resolution" in lowered
            or "getaddrinfo" in lowered
            or "[errno -2]" in lowered
            or "[errno -3]" in lowered
            or "[errno -5]" in lowered
            or "no address associated" in lowered
        ):
            return (
                f"DNS resolution failed: the backend cannot resolve '{host}'",
                "The backend runs inside its own container, whose resolver may not know "
                "this name (private DNS, Tailscale/MagicDNS, hosts file on the host). "
                "Either use an IP address, add the name under 'extra_hosts' of the backend "
                "service in docker-compose, or point the container at your DNS server "
                "with the 'dns:' option.",
            )
        if (
            "connection refused" in lowered
            or "[errno 111]" in lowered
            or "all connection attempts failed" in lowered
        ):
            return (
                f"Connection refused by {host}",
                "Nothing is listening on that host/port from the backend's point of view. "
                "If the service runs on the same machine, remember that 'localhost' inside "
                "the backend container is the container itself: use the service name from "
                "docker-compose, the host's LAN IP, or host.docker.internal.",
            )
        if "certificate" in lowered or "ssl" in lowered or "tls" in lowered:
            return (
                f"TLS handshake failed with {host}: {msg}",
                "Self-signed or private CA? Set LLM_VERIFY_SSL / VOXHUB_VERIFY_SSL to the "
                "path of the CA bundle, or to 'false' to skip verification.",
            )
        if "no route to host" in lowered or "network is unreachable" in lowered:
            return (
                f"Network unreachable: no route from the backend to {host}",
                "Check the container's network (firewall, VPN, docker network isolation).",
            )
        return (f"Cannot connect to {host}: {msg}", None)

    if isinstance(exc, (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.PoolTimeout, httpx.WriteTimeout)):
        return (
            f"Timeout while contacting {host}",
            "The host may be up but not answering on that port, or a firewall drops the packets.",
        )

    if isinstance(exc, httpx.HTTPStatusError):
        r = exc.response
        body = r.text[:300].strip()
        if r.status_code in (401, 403):
            return (
                f"HTTP {r.status_code} from {host}: authentication rejected",
                "Check the API key (and that it is sent as a Bearer token for this service).",
            )
        if r.status_code == 404:
            return (
                f"HTTP 404 from {host}: endpoint not found at {r.request.url.path}",
                "The base URL is probably wrong: it must be the OpenAI-compatible root "
                "('/v1' for Ollama, vLLM, LM Studio, OpenAI; '/api' for Open WebUI).",
            )
        return (f"HTTP {r.status_code} from {host}: {body or r.reason_phrase}", None)

    if isinstance(exc, httpx.InvalidURL) or isinstance(exc, httpx.UnsupportedProtocol):
        return (f"Invalid URL '{url}': {msg}", "The URL must start with http:// or https://.")

    return (f"{exc.__class__.__name__}: {msg}", None)


def _extract_model_ids(payload: Any) -> List[str]:
    """Extract model ids from the usual list-models shapes.

    Handles OpenAI / vLLM / Ollama ``/v1/models`` and Open WebUI ``/api/models``
    (``{"data": [{"id": ...}]}``), Ollama native ``/api/tags`` (``{"models":
    [{"name": ...}]}``), and a bare list of strings or objects.
    """
    items: Any = payload
    if isinstance(payload, dict):
        items = payload.get("data") or payload.get("models") or []
    ids: List[str] = []
    if not isinstance(items, list):
        return ids
    for item in items:
        if isinstance(item, str):
            ids.append(item)
        elif isinstance(item, dict):
            mid = item.get("id") or item.get("name") or item.get("model")
            if isinstance(mid, str) and mid:
                ids.append(mid)
    # Dedupe, keep order
    seen = set()
    out = []
    for m in ids:
        if m not in seen:
            seen.add(m)
            out.append(m)
    return out


def _result(
    service: str,
    url: str,
    model: str,
    *,
    ok: bool,
    latency_ms: Optional[int] = None,
    models: Optional[List[str]] = None,
    error: Optional[str] = None,
    hint: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    models = models or []
    return {
        "service": service,
        "ok": ok,
        "url": url,
        "latency_ms": latency_ms,
        "model": model,
        "models": models,
        "model_found": (model in models) if (ok and models and model) else None,
        "error": error,
        "hint": hint,
        "details": details or {},
    }


async def check_llm(
    api_url: str, api_key: str, model: str, verify: Any, timeout: float = 10.0
) -> Dict[str, Any]:
    """Probe an OpenAI-compatible endpoint: GET {api_url}/models."""
    base = (api_url or "").strip().rstrip("/")
    if not base:
        return _result("llm", base, model, ok=False, error="LLM API URL is empty")
    url = f"{base}/models"
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            payload = r.json()
    except httpx.HTTPError as e:
        msg, hint = describe_http_error(e, url)
        return _result("llm", base, model, ok=False, error=msg, hint=hint)
    except ValueError:
        return _result(
            "llm", base, model, ok=False,
            error=f"{url} answered 200 but not with JSON",
            hint="The base URL probably points at a web page rather than the API root.",
        )
    latency = int((time.monotonic() - t0) * 1000)
    models = _extract_model_ids(payload)
    res = _result("llm", base, model, ok=True, latency_ms=latency, models=models)
    if models and model and model not in models:
        res["hint"] = f"Model '{model}' is not in the list returned by the server."
    return res


async def check_voxhub(
    api_url: str, api_key: str, model: str, verify: Any, timeout: float = 10.0
) -> Dict[str, Any]:
    """Probe VoxHub: GET /health, then GET /v1/models and /models/list."""
    base = (api_url or "").strip().rstrip("/")
    if not base:
        return _result("voxhub", base, model, ok=False, error="VoxHub API URL is empty")
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    url = f"{base}/health"
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=verify) as client:
            r = await client.get(url, headers=headers)
            r.raise_for_status()
            latency = int((time.monotonic() - t0) * 1000)
            details: Dict[str, Any] = {}
            try:
                details["health"] = r.json()
            except ValueError:
                details["health"] = r.text[:200]

            models: List[str] = []
            try:
                rm = await client.get(f"{base}/v1/models", headers=headers)
                rm.raise_for_status()
                models = _extract_model_ids(rm.json())
            except (httpx.HTTPError, ValueError) as e:
                details["models_error"] = describe_http_error(e, f"{base}/v1/models")[0]

            try:
                rl = await client.get(f"{base}/models/list", headers=headers)
                if rl.status_code == 200:
                    details["loaded"] = _extract_model_ids(rl.json())
            except (httpx.HTTPError, ValueError):
                pass
    except httpx.HTTPError as e:
        msg, hint = describe_http_error(e, url)
        return _result("voxhub", base, model, ok=False, error=msg, hint=hint)

    res = _result("voxhub", base, model, ok=True, latency_ms=latency, models=models, details=details)
    if models and model and model not in models:
        res["hint"] = f"Model '{model}' is not in VoxHub's models.yaml."
    return res

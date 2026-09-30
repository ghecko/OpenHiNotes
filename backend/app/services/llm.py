"""LLM access (OpenAI-compatible chat completions).

Every call streams from the LLM, even when the caller wants the whole answer:
a dense "thinking" model can reason for minutes before writing a word, and a
non-streamed request stays silent for all that time, so any idle timeout on
the way (ours, Open WebUI's, a CDN's) kills it. Streaming turns the timeout
into "no token for N seconds", which a model that is actually working never
hits, plus an overall ceiling so a looping model cannot run forever.

The model's reasoning is split from its answer, whichever way the server
sends it: a separate delta field (`reasoning_content`, `reasoning`,
`thinking`) or inline tags in the content (`<think>...</think>`, including
the implicit form where only the closing tag is emitted).
"""

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import AsyncGenerator, Awaitable, Callable, Dict, List, Optional, Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.schemas.chat import ChatMessage
from app.services.connectivity import describe_http_error

logger = logging.getLogger(__name__)


# ── Reasoning control ─────────────────────────────────────────────────────
# How a requested reasoning level is expressed depends on the server/model,
# so the admin picks the dialect (llm_reasoning_control) and the UI only
# offers the levels that dialect understands.

REASONING_CONTROLS: Dict[str, Dict[str, Any]] = {
    "": {"label": "Not configured (model default, no selector)", "levels": []},
    "reasoning_effort": {
        "label": "reasoning_effort (OpenAI, gpt-oss on vLLM/Ollama, Open WebUI)",
        "levels": ["low", "medium", "high"],
    },
    "enable_thinking": {
        "label": "chat_template_kwargs.enable_thinking (Qwen3 / hybrid models on vLLM, SGLang)",
        "levels": ["off", "on"],
    },
    "ollama_think": {
        "label": "think (Ollama)",
        "levels": ["off", "on", "low", "medium", "high"],
    },
}

REASONING_LEVEL_LABELS = {
    "off": "Off",
    "on": "On",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
}


def reasoning_levels_for(control: str) -> List[str]:
    return list(REASONING_CONTROLS.get(control or "", {}).get("levels", []))


def apply_reasoning(payload: Dict[str, Any], control: str, level: Optional[str]) -> bool:
    """Add the reasoning parameter for ``level`` to ``payload``.

    Returns False (and leaves the payload alone) when there is nothing to
    send: no control configured, no level / "default", or a level the
    control does not support (e.g. the admin changed the control after the
    summary was queued).
    """
    if not control or not level or level == "default":
        return False
    if level not in reasoning_levels_for(control):
        logger.warning("Reasoning level %r not supported by control %r, ignored", level, control)
        return False
    if control == "reasoning_effort":
        payload["reasoning_effort"] = level
    elif control == "enable_thinking":
        kwargs = payload.get("chat_template_kwargs")
        if not isinstance(kwargs, dict):
            kwargs = {}
        kwargs["enable_thinking"] = level == "on"
        payload["chat_template_kwargs"] = kwargs
    elif control == "ollama_think":
        payload["think"] = {"off": False, "on": True}.get(level, level)
    else:
        return False
    return True


def _deep_merge(base: Dict[str, Any], extra: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v
    return base


def parse_extra_body(raw: str) -> Dict[str, Any]:
    """Parse the llm_extra_body setting. Raises ValueError when invalid."""
    raw = (raw or "").strip()
    if not raw:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("must be a JSON object")
    reserved = {"messages", "stream", "model"} & value.keys()
    if reserved:
        raise ValueError(f"must not override {', '.join(sorted(reserved))}")
    return value


def _fmt_duration(seconds: float) -> str:
    return f"{seconds:.0f} s" if seconds < 120 else f"{seconds / 60:.0f} min"


def _positive_float(raw: str, default: float) -> float:
    try:
        v = float(str(raw).strip())
        return v if v > 0 else default
    except (TypeError, ValueError):
        return default


# ── Reasoning / answer splitting ──────────────────────────────────────────

_REASONING_FIELDS = ("reasoning_content", "reasoning", "thinking")
_OPEN_TAG_RE = re.compile(
    r"^(?:<think>|<thinking>|<reasoning>|<details\b[^>]*\btype=\"reasoning\"[^>]*>)",
    re.IGNORECASE,
)
_CLOSE_FOR = {"<think>": "</think>", "<thinking>": "</thinking>", "<reasoning>": "</reasoning>"}
_OPEN_PREFIXES = ("<think>", "<thinking>", "<reasoning>", "<details")
_IMPLICIT_CLOSE = "</think>"


class ReasoningSplitter:
    """Incrementally separate reasoning from the answer in a streamed reply.

    ``feed()`` returns the answer text that became final with this chunk, so
    a chat UI can stream it. ``finish()`` then settles the ambiguous cases
    (unterminated block, implicit ``</think>``) and returns the final split.
    """

    def __init__(self) -> None:
        self._state = "start"   # start | tag | answer
        self._buf = ""          # undecided content (start / tag states)
        self._close = ""
        self._answer: List[str] = []
        self._reasoning: List[str] = []

    # progress helpers
    @property
    def answer(self) -> str:
        return "".join(self._answer)

    @property
    def reasoning(self) -> str:
        return "".join(self._reasoning) + (self._buf if self._state == "tag" else "")

    @property
    def committed_reasoning(self) -> str:
        """Reasoning that will not change any more (safe to stream as deltas):
        excludes the tail kept back in case it starts the closing tag."""
        return "".join(self._reasoning)

    @property
    def phase(self) -> str:
        if self._answer and "".join(self._answer).strip():
            return "writing"
        if self._state == "tag" or self._reasoning:
            return "thinking"
        return "waiting"

    def feed(self, content: Optional[str] = None, reasoning: Optional[str] = None) -> str:
        if reasoning:
            self._reasoning.append(reasoning)
        if not content:
            return ""
        emitted: List[str] = []
        self._buf += content
        while self._buf:
            if self._state == "start":
                stripped = self._buf.lstrip()
                if not stripped:
                    return "".join(emitted)
                m = _OPEN_TAG_RE.match(stripped)
                if m:
                    tag = m.group(0)
                    self._close = _CLOSE_FOR.get(tag.lower(), "</details>")
                    self._state = "tag"
                    self._buf = stripped[m.end():]
                    continue
                low = stripped.lower()
                maybe_tag = any(p.startswith(low) or (low.startswith(p) and ">" not in low)
                                for p in _OPEN_PREFIXES) and len(low) < 300
                if maybe_tag:
                    return "".join(emitted)  # wait for more
                self._state = "answer"
                continue
            if self._state == "tag":
                idx = self._buf.lower().find(self._close.lower())
                if idx >= 0:
                    self._reasoning.append(self._buf[:idx])
                    rest = self._buf[idx + len(self._close):].lstrip()
                    self._buf = rest
                    self._state = "answer"
                    continue
                # keep a tail that could be the start of the closing tag
                keep = len(self._close) - 1
                if len(self._buf) > keep:
                    self._reasoning.append(self._buf[:-keep] if keep else self._buf)
                    self._buf = self._buf[-keep:] if keep else ""
                return "".join(emitted)
            # answer
            text = self._buf if self._answer else self._buf.lstrip()
            self._buf = ""
            if text:
                self._answer.append(text)
                emitted.append(text)
        return "".join(emitted)

    def finish(self) -> tuple[str, str]:
        """Return (answer, reasoning) once the stream is over."""
        if self._state == "start" and self._buf.strip():
            self._answer.append(self._buf.lstrip())
        elif self._state == "tag":
            # Block never closed: everything was reasoning, no answer.
            self._reasoning.append(self._buf)
        self._buf = ""
        answer = "".join(self._answer)
        reasoning = "".join(self._reasoning)
        # Implicit opening tag (chat template already opened <think>): the
        # answer channel carries "reasoning </think> answer".
        if _IMPLICIT_CLOSE in answer.lower():
            idx = answer.lower().rfind(_IMPLICIT_CLOSE)
            reasoning = f"{reasoning}\n{answer[:idx]}" if reasoning else answer[:idx]
            answer = answer[idx + len(_IMPLICIT_CLOSE):]
        return answer.strip(), reasoning.strip()


# ── Results ───────────────────────────────────────────────────────────────

class LLMError(Exception):
    """An LLM call failed; the message is meant for the end user."""


@dataclass
class LLMProgress:
    phase: str
    answer: str
    reasoning: str
    elapsed: float


@dataclass
class LLMResult:
    content: str
    reasoning: str
    model: str
    finish_reason: Optional[str] = None
    warning: Optional[str] = None
    elapsed: float = 0.0
    extra: Dict[str, Any] = field(default_factory=dict)


ProgressCallback = Callable[[LLMProgress], Awaitable[None]]


class LLMService:
    """Service for LLM operations."""

    DEFAULT_SYSTEM_PROMPT = (
        "You are a professional meeting assistant. Your role is to analyze transcripts "
        "and produce clear, well-structured summaries in Markdown format. Always respond "
        "in the same language as the transcript. Be concise, factual, and action-oriented. "
        "Preserve speaker attributions when relevant. Use the section structure requested "
        "by the user prompt or template."
    )

    DEFAULT_IDLE_TIMEOUT = 300.0     # s without any byte from the LLM
    DEFAULT_MAX_DURATION = 1800.0    # s for a whole generation
    PROGRESS_INTERVAL = 1.5          # s between progress callbacks

    @staticmethod
    async def _resolve_settings(db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        """Resolve LLM settings from DB or fall back to env."""
        keys = (
            "llm_api_url", "llm_api_key", "llm_model", "llm_system_prompt",
            "llm_reasoning_control", "llm_reasoning_default", "llm_extra_body",
            "llm_idle_timeout", "llm_max_duration",
        )
        if db:
            from app.services.settings_service import get_effective_setting
            raw = {k: await get_effective_setting(db, k) for k in keys}
        else:
            raw = {k: getattr(settings, k, "") for k in keys}
        try:
            extra_body = parse_extra_body(raw["llm_extra_body"])
        except ValueError as e:
            logger.warning("Ignoring invalid llm_extra_body: %s", e)
            extra_body = {}
        control = (raw["llm_reasoning_control"] or "").strip()
        if control not in REASONING_CONTROLS:
            logger.warning("Unknown llm_reasoning_control %r, ignored", control)
            control = ""
        return {
            "llm_api_url": (raw["llm_api_url"] or "").rstrip("/"),
            "llm_api_key": raw["llm_api_key"],
            "llm_model": raw["llm_model"],
            "llm_system_prompt": raw["llm_system_prompt"] or LLMService.DEFAULT_SYSTEM_PROMPT,
            "reasoning_control": control,
            "reasoning_default": (raw["llm_reasoning_default"] or "").strip(),
            "extra_body": extra_body,
            "idle_timeout": _positive_float(raw["llm_idle_timeout"], LLMService.DEFAULT_IDLE_TIMEOUT),
            "max_duration": _positive_float(raw["llm_max_duration"], LLMService.DEFAULT_MAX_DURATION),
        }

    @staticmethod
    async def resolve_settings(db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        return await LLMService._resolve_settings(db)

    @staticmethod
    async def get_features(db: Optional[AsyncSession] = None) -> Dict[str, Any]:
        """What the UI needs to offer a reasoning selector."""
        cfg = await LLMService._resolve_settings(db)
        levels = reasoning_levels_for(cfg["reasoning_control"])
        default = cfg["reasoning_default"] if cfg["reasoning_default"] in levels else None
        return {
            "model": cfg["llm_model"],
            "reasoning_control": cfg["reasoning_control"],
            "reasoning_levels": [{"value": l, "label": REASONING_LEVEL_LABELS[l]} for l in levels],
            "reasoning_default": default,
        }

    @staticmethod
    def build_summary_prompt(
        transcript_text: str,
        prompt_template: str,
        meeting_date: Optional[str] = None,
    ) -> str:
        """Fill the template/custom prompt placeholders."""
        final_prompt = prompt_template.replace("{{transcript}}", transcript_text)
        final_prompt = final_prompt.replace("{{meeting_date}}", meeting_date or "Not available")
        # Always give the transcript to the model, even without the placeholder.
        if transcript_text not in final_prompt:
            final_prompt = f"Here is the transcript:\n\n{transcript_text}\n\n---\n\n{final_prompt}"
        return final_prompt

    @staticmethod
    def _build_payload(
        cfg: Dict[str, Any],
        messages: List[Dict[str, str]],
        model: Optional[str],
        temperature: Optional[float],
        max_tokens: Optional[int],
        reasoning_level: Optional[str],
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        _deep_merge(payload, json.loads(json.dumps(cfg["extra_body"])))  # copy
        if temperature is not None:
            payload.setdefault("temperature", temperature)
        if max_tokens:
            payload["max_tokens"] = max_tokens
        level = reasoning_level if reasoning_level and reasoning_level != "default" else cfg["reasoning_default"]
        apply_reasoning(payload, cfg["reasoning_control"], level)
        payload["model"] = model or cfg["llm_model"]
        payload["messages"] = messages
        payload["stream"] = True
        return payload

    @staticmethod
    async def _stream(
        cfg: Dict[str, Any],
        payload: Dict[str, Any],
        splitter: ReasoningSplitter,
        on_chunk: Callable[[str, Optional[str], Optional[str]], Awaitable[None]],
    ) -> None:
        """POST the request and feed every chunk to ``on_chunk(answer_piece, model, finish_reason)``.

        Handles SSE (normal case) and a plain JSON body (servers that ignore
        ``stream``). Raises LLMError with an actionable message.
        """
        url = f"{cfg['llm_api_url']}/chat/completions"
        headers = {"Accept": "text/event-stream"}
        if cfg["llm_api_key"]:
            headers["Authorization"] = f"Bearer {cfg['llm_api_key']}"
        idle = cfg["idle_timeout"]
        timeout = httpx.Timeout(connect=15.0, read=idle, write=60.0, pool=15.0)

        try:
            async with httpx.AsyncClient(timeout=timeout, verify=settings.llm_ssl_verify) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        body = (await response.aread()).decode(errors="replace")[:500]
                        raise LLMError(f"LLM API error: {response.status_code} - {body}")

                    ctype = response.headers.get("content-type", "")
                    if "event-stream" not in ctype and "json" in ctype:
                        data = json.loads(await response.aread())
                        choice = (data.get("choices") or [{}])[0]
                        msg = choice.get("message") or {}
                        reasoning = next((msg[f] for f in _REASONING_FIELDS if isinstance(msg.get(f), str)), None)
                        piece = splitter.feed(msg.get("content") or "", reasoning)
                        await on_chunk(piece, data.get("model"), choice.get("finish_reason"))
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        if data.get("error"):
                            err = data["error"]
                            msg = err.get("message") if isinstance(err, dict) else str(err)
                            raise LLMError(f"LLM stream error: {msg}")
                        choices = data.get("choices") or []
                        if not choices:
                            await on_chunk("", data.get("model"), None)
                            continue
                        choice = choices[0]
                        delta = choice.get("delta") or choice.get("message") or {}
                        reasoning = next(
                            (delta[f] for f in _REASONING_FIELDS if isinstance(delta.get(f), str) and delta.get(f)),
                            None,
                        )
                        piece = splitter.feed(delta.get("content") or "", reasoning)
                        await on_chunk(piece, data.get("model"), choice.get("finish_reason"))
        except LLMError:
            raise
        except httpx.ReadTimeout:
            raise LLMError(
                f"No data from the LLM for {_fmt_duration(idle)} (idle timeout). The model may be "
                "stuck or overloaded; raise 'LLM idle timeout' in the admin settings if "
                "it is just slow to start (very long prompt)."
            )
        except httpx.HTTPError as e:
            msg, hint = describe_http_error(e, url)
            raise LLMError(msg + (f". {hint}" if hint else ""))

    @staticmethod
    async def complete(
        messages: List[Dict[str, str]],
        *,
        db: Optional[AsyncSession] = None,
        model: Optional[str] = None,
        temperature: Optional[float] = 0.7,
        max_tokens: Optional[int] = None,
        reasoning_level: Optional[str] = None,
        on_progress: Optional[ProgressCallback] = None,
        cfg: Optional[Dict[str, Any]] = None,
    ) -> LLMResult:
        """Run a chat completion to the end and return the answer and reasoning.

        ``cfg`` (from ``resolve_settings``) lets long-running callers resolve
        the settings with a short DB session instead of holding one open for
        the whole generation.
        """
        cfg = cfg or await LLMService._resolve_settings(db)
        payload = LLMService._build_payload(cfg, messages, model, temperature, max_tokens, reasoning_level)
        splitter = ReasoningSplitter()
        state = {"model": payload["model"], "finish": None, "last_progress": 0.0}
        t0 = time.monotonic()

        async def on_chunk(_piece: str, chunk_model: Optional[str], finish: Optional[str]) -> None:
            if chunk_model:
                state["model"] = chunk_model
            if finish:
                state["finish"] = finish
            now = time.monotonic()
            if on_progress and now - state["last_progress"] >= LLMService.PROGRESS_INTERVAL:
                state["last_progress"] = now
                await on_progress(LLMProgress(splitter.phase, splitter.answer, splitter.reasoning, now - t0))

        max_duration = cfg["max_duration"]
        try:
            async with asyncio.timeout(max_duration):
                await LLMService._stream(cfg, payload, splitter, on_chunk)
        except TimeoutError:
            raise LLMError(
                f"The LLM did not finish within {_fmt_duration(max_duration)} (max duration). "
                "Lower the thinking level or raise 'LLM max duration' in the admin settings."
            )

        answer, reasoning = splitter.finish()
        elapsed = time.monotonic() - t0
        finish = state["finish"]
        warning = None
        if not answer:
            if finish == "length":
                raise LLMError(
                    "The model hit its output token limit while thinking and produced no answer. "
                    "Lower the thinking level, or raise the server's max tokens."
                )
            if reasoning:
                raise LLMError("The model only produced reasoning and no answer.")
            raise LLMError("The model returned an empty answer.")
        if finish == "length":
            warning = "Output truncated: the model hit its output token limit."
        return LLMResult(answer, reasoning, state["model"], finish, warning, elapsed)

    @staticmethod
    async def chat_events(
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        reasoning_level: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream a chat completion as UI events.

        Events (one dict each): ``{"phase": "waiting"|"thinking"|"writing"}``
        when the phase changes, ``{"reasoning": piece}`` and
        ``{"content": piece}`` deltas, ``{"final": {"content", "reasoning"}}``
        when the settled split differs from what was streamed (implicit
        ``</think>``: the reasoning went out as content), ``{"warning": text}``
        and ``{"done": {"model", "finish_reason", "elapsed"}}``. Errors are
        raised as LLMError.
        """
        cfg = await LLMService._resolve_settings(db)
        message_dicts = [{"role": m.role, "content": m.content} for m in messages]
        payload = LLMService._build_payload(
            cfg, message_dicts, model, temperature, max_tokens, reasoning_level
        )
        splitter = ReasoningSplitter()
        queue: asyncio.Queue = asyncio.Queue()
        state = {
            "model": payload["model"], "finish": None,
            "phase": "waiting", "content": "", "reasoning_len": 0,
        }
        t0 = time.monotonic()

        async def emit(event: Dict[str, Any]) -> None:
            await queue.put(event)

        async def on_chunk(piece: str, chunk_model: Optional[str], finish: Optional[str]) -> None:
            if chunk_model:
                state["model"] = chunk_model
            if finish:
                state["finish"] = finish
            committed = splitter.committed_reasoning
            if len(committed) > state["reasoning_len"]:
                await emit({"reasoning": committed[state["reasoning_len"]:]})
                state["reasoning_len"] = len(committed)
            if piece:
                state["content"] += piece
                await emit({"content": piece})
            phase = splitter.phase
            if phase != state["phase"]:
                state["phase"] = phase
                await emit({"phase": phase})

        async def run() -> None:
            try:
                await emit({"phase": "waiting"})
                async with asyncio.timeout(cfg["max_duration"]):
                    await LLMService._stream(cfg, payload, splitter, on_chunk)
                answer, reasoning = splitter.finish()
                finish = state["finish"]
                if not answer:
                    if finish == "length":
                        raise LLMError(
                            "The model hit its output token limit while thinking and produced "
                            "no answer. Lower the thinking level, or raise the server's max tokens."
                        )
                    if reasoning:
                        raise LLMError("The model only produced reasoning and no answer.")
                    raise LLMError("The model returned an empty answer.")
                streamed_reasoning = splitter.committed_reasoning[:state["reasoning_len"]]
                if answer != state["content"].strip() or reasoning != streamed_reasoning.strip():
                    # Non-streaming server, or reasoning that leaked into the
                    # answer channel (implicit </think>): send the settled split.
                    await emit({"final": {"content": answer, "reasoning": reasoning}})
                if finish == "length":
                    await emit({"warning": "Output truncated: the model hit its output token limit."})
                await emit({"done": {
                    "model": state["model"], "finish_reason": finish,
                    "elapsed": round(time.monotonic() - t0, 1),
                }})
                await queue.put(None)
            except TimeoutError:
                await queue.put(LLMError(
                    f"The LLM did not finish within {_fmt_duration(cfg['max_duration'])} (max duration). "
                    "Lower the thinking level or raise 'LLM max duration' in the admin settings."
                ))
            except Exception as e:  # forwarded to the consumer
                await queue.put(e)

        task = asyncio.create_task(run())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                yield item
        finally:
            if not task.done():
                task.cancel()

    @staticmethod
    async def chat_completion(
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        db: Optional[AsyncSession] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream the answer text only (reasoning dropped). See ``chat_events``."""
        async for event in LLMService.chat_events(
            messages, model=model, temperature=temperature, max_tokens=max_tokens, db=db
        ):
            if "content" in event:
                yield event["content"]
            elif "final" in event:
                yield event["final"]["content"]

import httpx
import json
from typing import AsyncGenerator, Optional, List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.schemas.chat import ChatMessage


class LLMService:
    """Service for LLM operations."""

    @staticmethod
    async def _resolve_settings(db: Optional[AsyncSession] = None) -> Dict[str, str]:
        """Resolve LLM settings from DB or fall back to env."""
        if db:
            from app.services.settings_service import get_effective_setting
            return {
                "llm_api_url": await get_effective_setting(db, "llm_api_url"),
                "llm_api_key": await get_effective_setting(db, "llm_api_key"),
                "llm_model": await get_effective_setting(db, "llm_model"),
            }
        return {
            "llm_api_url": settings.llm_api_url,
            "llm_api_key": settings.llm_api_key,
            "llm_model": settings.llm_model,
        }

    @staticmethod
    async def create_summary(
        transcript_text: str,
        prompt_template: str,
        custom_prompt: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> tuple[str, str]:
        """Create a summary from a transcript using a template or custom prompt."""
        cfg = await LLMService._resolve_settings(db)

        # Use custom prompt if provided, otherwise use template
        if custom_prompt:
            final_prompt = custom_prompt.replace("{{transcript}}", transcript_text)
        else:
            final_prompt = prompt_template.replace("{{transcript}}", transcript_text)

        # Ensure the transcript is always included: if the prompt doesn't contain
        # the transcript text (i.e. no {{transcript}} placeholder was present),
        # prepend it so the LLM always has the transcript as context.
        if transcript_text not in final_prompt:
            final_prompt = f"Here is the transcript:\n\n{transcript_text}\n\n---\n\n{final_prompt}"

        messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes transcripts."},
            {"role": "user", "content": final_prompt},
        ]

        url = f"{cfg['llm_api_url']}/chat/completions"
        headers = {}
        if cfg["llm_api_key"]:
            headers["Authorization"] = f"Bearer {cfg['llm_api_key']}"

        payload = {
            "model": cfg["llm_model"],
            "messages": messages,
            "temperature": 0.7,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=120.0, verify=settings.llm_ssl_verify) as client:
            response = await client.post(url, json=payload, headers=headers)

        if response.status_code != 200:
            raise Exception(f"LLM API error: {response.status_code} - {response.text}")

        result = response.json()
        summary_text = result["choices"][0]["message"]["content"]
        model_used = result.get("model", cfg["llm_model"])

        return summary_text, model_used

    @staticmethod
    async def chat_completion(
        messages: List[ChatMessage],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        db: Optional[AsyncSession] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion responses."""
        cfg = await LLMService._resolve_settings(db)
        model_to_use = model or cfg["llm_model"]

        # Convert ChatMessage objects to dicts
        message_dicts = [{"role": m.role, "content": m.content} for m in messages]

        url = f"{cfg['llm_api_url']}/chat/completions"
        headers = {}
        if cfg["llm_api_key"]:
            headers["Authorization"] = f"Bearer {cfg['llm_api_key']}"

        payload = {
            "model": model_to_use,
            "messages": message_dicts,
            "temperature": temperature,
            "stream": True,
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=120.0, verify=settings.llm_ssl_verify) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    raise Exception(f"LLM API error: {response.status_code} - {error_body.decode()}")

                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data.get("choices", [{}])[0].get("delta", {})
                            if "content" in delta and delta["content"]:
                                yield delta["content"]
                        except json.JSONDecodeError:
                            continue

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Sequence

import httpx

from config.loader import CloudModelSettings


class CloudGateway:
    """OpenAI-compatible async cloud gateway (Groq, DeepSeek, and compatible providers)."""

    def __init__(self, settings: CloudModelSettings) -> None:
        self.provider = settings.provider.lower()
        self.api_base = settings.api_base.rstrip("/")
        self.model = settings.model
        self.api_key = settings.api_key
        self.timeout_seconds = settings.timeout_seconds
        self._client = httpx.AsyncClient(timeout=self.timeout_seconds)

    async def close(self) -> None:
        await self._client.aclose()

    async def generate(
        self,
        prompt: str,
        stream: bool = False,
        temperature: float = 0.2,
        max_tokens: int = 2048,
    ) -> str | AsyncIterator[str]:
        messages = [{"role": "user", "content": prompt}]
        return await self.chat(messages=messages, stream=stream, temperature=temperature, max_tokens=max_tokens)

    async def chat(
        self,
        messages: Sequence[dict[str, str]],
        stream: bool = False,
        temperature: float = 0.2,
        max_tokens: int = 2048,
    ) -> str | AsyncIterator[str]:
        self._ensure_api_key()
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }

        endpoint = f"{self.api_base}/chat/completions"
        if stream:
            return self._stream_chat(endpoint, payload)

        response = await self._client.post(endpoint, json=payload, headers=self._headers())
        response.raise_for_status()
        body = response.json()
        return str(body.get("choices", [{}])[0].get("message", {}).get("content", ""))

    async def embeddings(self, text: str, model: str | None = None) -> list[float]:
        self._ensure_api_key()
        payload = {"model": model or "text-embedding-3-small", "input": text}
        response = await self._client.post(f"{self.api_base}/embeddings", json=payload, headers=self._headers())
        response.raise_for_status()
        body = response.json()
        embedding = body.get("data", [{}])[0].get("embedding", [])
        return [float(value) for value in embedding]

    def _stream_chat(self, endpoint: str, payload: dict[str, Any]) -> AsyncIterator[str]:
        async def iterator() -> AsyncIterator[str]:
            async with self._client.stream("POST", endpoint, json=payload, headers=self._headers()) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        chunk = line[len("data: ") :]
                    else:
                        chunk = line

                    if chunk.strip() == "[DONE]":
                        break

                    try:
                        data = json.loads(chunk)
                    except json.JSONDecodeError:
                        continue

                    delta = data.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield str(delta)

        return iterator()

    def _ensure_api_key(self) -> None:
        if not self.api_key:
            raise RuntimeError(
                f"Cloud provider '{self.provider}' requires an API key. "
                "Set CLOUD_API_KEY or provider-specific env vars."
            )

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }


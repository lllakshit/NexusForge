from __future__ import annotations

import json
from typing import Any, AsyncIterator, Sequence

import httpx

from config.loader import LocalModelSettings


class OllamaGateway:
    """Async gateway for local Ollama models."""

    def __init__(self, settings: LocalModelSettings) -> None:
        self.base_url = settings.base_url.rstrip("/")
        self.model = settings.model
        self.timeout_seconds = settings.timeout_seconds
        self._client = httpx.AsyncClient(timeout=self.timeout_seconds)

    async def close(self) -> None:
        await self._client.aclose()

    async def generate(
        self,
        prompt: str,
        stream: bool = False,
        options: dict[str, Any] | None = None,
    ) -> str | AsyncIterator[str]:
        payload: dict[str, Any] = {"model": self.model, "prompt": prompt, "stream": stream}
        if options:
            payload["options"] = options

        if stream:
            return self._stream_ollama("/api/generate", payload, response_key="response")

        response = await self._client.post(f"{self.base_url}/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()
        return str(data.get("response", ""))

    async def chat(
        self,
        messages: Sequence[dict[str, str]],
        stream: bool = False,
        options: dict[str, Any] | None = None,
    ) -> str | AsyncIterator[str]:
        payload: dict[str, Any] = {"model": self.model, "messages": list(messages), "stream": stream}
        if options:
            payload["options"] = options

        if stream:
            return self._stream_ollama("/api/chat", payload, response_key="message")

        response = await self._client.post(f"{self.base_url}/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        return str(data.get("message", {}).get("content", ""))

    async def embeddings(self, text: str) -> list[float]:
        payload = {"model": self.model, "prompt": text}
        response = await self._client.post(f"{self.base_url}/api/embeddings", json=payload)
        response.raise_for_status()
        data = response.json()
        embedding = data.get("embedding", [])
        return [float(value) for value in embedding]

    def _stream_ollama(
        self,
        endpoint: str,
        payload: dict[str, Any],
        response_key: str,
    ) -> AsyncIterator[str]:
        async def iterator() -> AsyncIterator[str]:
            async with self._client.stream("POST", f"{self.base_url}{endpoint}", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if data.get("done"):
                        break

                    if response_key == "message":
                        chunk = str(data.get("message", {}).get("content", ""))
                    else:
                        chunk = str(data.get(response_key, ""))
                    if chunk:
                        yield chunk

        return iterator()


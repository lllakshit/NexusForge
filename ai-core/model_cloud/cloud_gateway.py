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
        if self.provider in {"gemini", "google"}:
            return await self._gemini_chat(messages, temperature=temperature, max_tokens=max_tokens)

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

    async def _gemini_chat(
        self,
        messages: Sequence[dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> str:
        system_parts = [item["content"] for item in messages if item.get("role") == "system" and item.get("content")]
        contents: list[dict[str, Any]] = []
        for item in messages:
            role = item.get("role", "user")
            if role == "system":
                continue
            contents.append(
                {
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": item.get("content", "")}],
                }
            )
        if not contents:
            raise RuntimeError("Gemini request has no user content.")

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_parts:
            payload["systemInstruction"] = {"parts": [{"text": "\n".join(system_parts)}]}

        candidates_models = [self.model, "gemini-2.5-flash", "gemini-1.5-flash", "gemini-pro"]
        last_error: Exception | None = None
        endpoints = []
        for raw_model in candidates_models:
            model_name = raw_model if raw_model.startswith("models/") else f"models/{raw_model}"
            endpoints.append((raw_model, f"https://generativelanguage.googleapis.com/v1beta/{model_name}:generateContent"))
            endpoints.append((raw_model, f"https://aiplatform.googleapis.com/v1/publishers/google/models/{raw_model}:generateContent"))
        for raw_model, endpoint in endpoints:
            response = await self._client.post(
                endpoint,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": str(self.api_key),
                },
            )
            if response.status_code == 404:
                last_error = RuntimeError(f"Gemini model not found: {raw_model}")
                continue
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError(self._safe_http_error(exc)) from exc
            body = response.json()
            candidates = body.get("candidates", [])
            parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
            text = "".join(str(part.get("text", "")) for part in parts)
            if text:
                self.model = raw_model
                return text
            last_error = RuntimeError("Gemini returned an empty response.")
        raise last_error or RuntimeError("Gemini request failed.")

    @staticmethod
    def _safe_http_error(exc: httpx.HTTPStatusError) -> str:
        url = str(exc.request.url.copy_with(query=None))
        status = exc.response.status_code
        detail = ""
        try:
            detail = str(exc.response.json().get("error", {}).get("message", ""))
        except Exception:
            detail = exc.response.text[:180]
        return f"Gemini HTTP {status} for {url}. {detail}".strip()

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
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.provider in {"gemini", "google"}:
            headers["x-goog-api-key"] = str(self.api_key)
        return headers


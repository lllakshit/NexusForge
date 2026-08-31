from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv

    load_dotenv()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass


class ServiceSettings(BaseModel):
    name: str = "ai-core"
    host: str = "0.0.0.0"
    port: int = 4011


class LocalModelSettings(BaseModel):
    provider: str = "ollama"
    base_url: str = "http://localhost:11434"
    model: str = "qwen2.5"
    ollama_path: str = r"F:\ollama"
    timeout_seconds: float = 180.0


class CloudModelSettings(BaseModel):
    provider: str = "gemini"
    api_base: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    model: str = "gemini-2.0-flash"
    api_key: str | None = None
    timeout_seconds: float = 180.0


class RoutingThresholds(BaseModel):
    local_token_limit: int = 900
    cloud_complexity_threshold: float = 5.8
    mixed_complexity_threshold: float = 4.2
    high_reasoning_depth: int = 7


class AgentLimits(BaseModel):
    max_local_agents: int = 1
    max_parallel_cloud_agents: int = 4
    queue_maxsize: int = 200
    retries: int = 2
    retry_backoff_seconds: float = 1.5
    max_context_chars: int = 5000


class MemorySettings(BaseModel):
    sqlite_path: str = "./data/ai_core.db"
    chroma_path: str = "./data/chroma"
    collection_name: str = "ai_core_memory"
    embedding_dimensions: int = 384
    retrieval_limit: int = 5


class EventSettings(BaseModel):
    enabled: bool = True
    nats_url: str = "nats://nats:4222"
    subject_prefix: str = "nexusforge"
    subjects: list[str] = Field(default_factory=lambda: ["task.created", "repo.updated", "job.requested"])


class RoutingModeSettings(BaseModel):
    # cloud = never call Ollama. hybrid = existing local/cloud/mixed router.
    mode: str = "hybrid"


class AppConfig(BaseModel):
    service: ServiceSettings = Field(default_factory=ServiceSettings)
    local_model: LocalModelSettings = Field(default_factory=LocalModelSettings)
    cloud_model: CloudModelSettings = Field(default_factory=CloudModelSettings)
    routing_thresholds: RoutingThresholds = Field(default_factory=RoutingThresholds)
    agent_limits: AgentLimits = Field(default_factory=AgentLimits)
    memory: MemorySettings = Field(default_factory=MemorySettings)
    events: EventSettings = Field(default_factory=EventSettings)
    routing: RoutingModeSettings = Field(default_factory=RoutingModeSettings)


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _resolve_config_path(path: str | None) -> Path:
    configured = path or os.getenv("AI_CORE_CONFIG")
    if configured:
        candidate = Path(configured)
        if candidate.is_absolute():
            return candidate
        cwd_candidate = (Path.cwd() / candidate).resolve()
        if cwd_candidate.exists():
            return cwd_candidate
        config_path = candidate
    else:
        config_path = Path(__file__).resolve().parent / "config.yaml"

    if not config_path.is_absolute():
        config_path = (Path(__file__).resolve().parent / config_path).resolve()
    return config_path


def _cloud_defaults(provider: str) -> tuple[str, str]:
    normalized = provider.lower()
    if normalized in {"gemini", "google"}:
        return "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash"
    if normalized in {"omniroute", "openrouter"}:
        return "http://127.0.0.1:20128/v1", "auto"
    if normalized == "openai":
        return "https://api.openai.com/v1", "gpt-4.1-mini"
    if normalized == "deepseek":
        return "https://api.deepseek.com/v1", "deepseek-chat"
    if normalized == "groq":
        return "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"
    return "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash"


def _apply_env_overrides(config: AppConfig) -> AppConfig:
    data = config.model_dump()

    local_model = data["local_model"]
    local_model["base_url"] = os.getenv("OLLAMA_BASE_URL", local_model["base_url"])
    local_model["model"] = os.getenv("OLLAMA_MODEL", local_model["model"])
    local_model["ollama_path"] = os.getenv("OLLAMA_PATH", local_model["ollama_path"])
    if os.getenv("OLLAMA_TIMEOUT_SECONDS"):
        local_model["timeout_seconds"] = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", local_model["timeout_seconds"]))

    cloud_model = data["cloud_model"]
    cloud_provider = os.getenv("CLOUD_PROVIDER", cloud_model["provider"]).lower()
    cloud_model["provider"] = cloud_provider

    default_base, default_model = _cloud_defaults(cloud_provider)
    cloud_model["api_base"] = os.getenv("CLOUD_API_BASE", cloud_model.get("api_base") or default_base)
    cloud_model["model"] = os.getenv("CLOUD_MODEL", cloud_model.get("model") or default_model)
    cloud_model["timeout_seconds"] = float(
        os.getenv("CLOUD_TIMEOUT_SECONDS", cloud_model.get("timeout_seconds", 180.0))
    )

    api_key = os.getenv("CLOUD_API_KEY")
    if not api_key and cloud_provider in {"gemini", "google"}:
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
    if not api_key and cloud_provider == "groq":
        api_key = os.getenv("GROQ_API_KEY")
    if not api_key and cloud_provider == "deepseek":
        api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key and cloud_provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
    if not api_key and cloud_provider in {"omniroute", "openrouter"}:
        api_key = os.getenv("OMNIROUTE_API_KEY") or os.getenv("OPENROUTER_API_KEY") or "omniroute"
    cloud_model["api_key"] = api_key

    routing = data.setdefault("routing", {})
    routing["mode"] = os.getenv("AI_ROUTE_MODE", routing.get("mode", "hybrid")).lower()

    events = data["events"]
    if os.getenv("AI_EVENTS_ENABLED"):
        events["enabled"] = os.getenv("AI_EVENTS_ENABLED", "true").lower() in {"1", "true", "yes"}

    service = data["service"]
    if os.getenv("PORT"):
        service["port"] = int(os.getenv("PORT", service["port"]))
    service["host"] = os.getenv("HOST", service["host"])

    events = data["events"]
    events["nats_url"] = os.getenv("NATS_URL", events["nats_url"])
    if os.getenv("EVENT_SUBJECT_PREFIX"):
        events["subject_prefix"] = os.getenv("EVENT_SUBJECT_PREFIX", events["subject_prefix"])

    memory = data["memory"]
    memory["sqlite_path"] = os.getenv("AI_CORE_SQLITE_PATH", memory["sqlite_path"])
    memory["chroma_path"] = os.getenv("AI_CORE_CHROMA_PATH", memory["chroma_path"])

    return AppConfig.model_validate(data)


@lru_cache(maxsize=4)
def load_config(path: str | None = None) -> AppConfig:
    config_path = _resolve_config_path(path)
    config_data: dict[str, Any] = {}

    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle) or {}
            if isinstance(loaded, dict):
                config_data = _deep_merge(config_data, loaded)

    config = AppConfig.model_validate(config_data)
    return _apply_env_overrides(config)

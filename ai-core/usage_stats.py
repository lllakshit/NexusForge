from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Any

_stats: dict[str, Any] = {
    "requests": 0,
    "tokens": 0,
    "errors": 0,
    "latencies_ms": deque(maxlen=50),
    "events": deque(maxlen=12),
}


def record_success(source: str, model: str, latency_ms: int, tokens: int = 0) -> None:
    _stats["requests"] += 1
    _stats["tokens"] += max(0, tokens)
    _stats["latencies_ms"].append(latency_ms)
    _stats["events"].appendleft(
        {
            "time": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "model": model,
            "status": "ok",
            "latency_ms": latency_ms,
        }
    )


def record_error(source: str, message: str) -> None:
    _stats["errors"] += 1
    _stats["events"].appendleft(
        {
            "time": datetime.now(timezone.utc).isoformat(),
            "source": source,
            "status": "error",
            "message": message,
        }
    )


def snapshot() -> dict[str, Any]:
    latencies = list(_stats["latencies_ms"])
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
    requests = _stats["requests"]
    errors = _stats["errors"]
    return {
        "requests": requests,
        "tokens": _stats["tokens"],
        "errors": errors,
        "avg_latency_ms": avg_latency,
        "error_rate": round((errors / requests) * 100, 2) if requests else 0,
        "events": list(_stats["events"]),
    }

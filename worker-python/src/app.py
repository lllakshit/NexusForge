import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from nats.aio.client import Client as NATS
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)
metrics = PrometheusMetrics(app)

OTEL_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4318")
NATS_URL = os.getenv("NATS_URL", "nats://nats:4222")

resource = Resource(attributes={"service.name": "worker-python"})
provider = TracerProvider(resource=resource)
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=f"{OTEL_ENDPOINT}/v1/traces")))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("worker-python")

FlaskInstrumentor().instrument_app(app)


async def publish_event(event_type: str, data: dict[str, Any], correlation_id: str) -> None:
    nc = NATS()
    await nc.connect(servers=[NATS_URL])
    envelope = {
        "id": str(uuid4()),
        "type": event_type,
        "source": "worker-python",
        "time": datetime.now(timezone.utc).isoformat(),
        "correlationId": correlation_id,
        "data": data,
    }
    subject = f"nexusforge.{event_type}"
    await nc.publish(subject, json.dumps(envelope).encode("utf-8"))
    await nc.drain()


def extract_numeric_values(payload: Any) -> list[float]:
    if isinstance(payload, dict):
        values = payload.get("values")
        if isinstance(values, list):
            return [float(v) for v in values if isinstance(v, (int, float))]

    if isinstance(payload, list):
        return [float(v) for v in payload if isinstance(v, (int, float))]

    return []


@app.get("/health")
def health():
    return jsonify(
        {
            "service": "worker-python",
            "status": "ok",
            "spiffe": os.getenv("SERVICE_SPIFFE_ID", "spiffe://nexusforge.local/worker-python"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.post("/task/run")
def run_task():
    payload = request.get_json(silent=True) or {}
    job_id = str(payload.get("jobId", ""))
    task_payload = payload.get("payload", {})
    correlation_id = request.headers.get("x-correlation-id", f"worker-{uuid4()}")

    with tracer.start_as_current_span("worker_python_task_run"):
        values = extract_numeric_values(task_payload)
        if values:
            frame = pd.DataFrame({"value": values})
            result = {
                "count": int(frame["value"].count()),
                "sum": float(frame["value"].sum()),
                "mean": float(np.mean(values)),
                "min": float(np.min(values)),
                "max": float(np.max(values)),
            }
        else:
            serialized = json.dumps(task_payload)
            result = {
                "count": 0,
                "message": "No numeric payload detected; processed as text.",
                "textLength": len(serialized),
            }

        asyncio.run(
            publish_event(
                "job.completed",
                {
                    "jobId": job_id,
                    "status": "completed",
                },
                correlation_id,
            )
        )

        return jsonify(
            {
                "jobId": job_id,
                "processedAt": datetime.now(timezone.utc).isoformat(),
                "result": result,
            }
        )


if __name__ == "__main__":
    asyncio.run(
        publish_event(
            "service.registered",
            {
                "service": "worker-python",
                "spiffeId": os.getenv("SERVICE_SPIFFE_ID", "spiffe://nexusforge.local/worker-python"),
            },
            "boot-worker-python",
        )
    )
    app.run(host="0.0.0.0", port=5000)

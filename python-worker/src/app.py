from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request

app = Flask(__name__)


def extract_numeric_values(payload: Any) -> list[float]:
    if isinstance(payload, list):
        return [float(item) for item in payload if isinstance(item, (int, float))]

    if isinstance(payload, dict):
        values = payload.get("values")
        if isinstance(values, list):
            return [float(item) for item in values if isinstance(item, (int, float))]

    return []


@app.get("/health")
def health():
    return jsonify(
        {
            "service": "python-worker",
            "status": "ok",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.post("/task/run")
def run_task():
    payload = request.get_json(silent=True) or {}
    job_id = payload.get("jobId", "")
    task_payload = payload.get("payload", {})

    numeric_values = extract_numeric_values(task_payload)

    if numeric_values:
        frame = pd.DataFrame({"values": numeric_values})
        result = {
            "count": int(frame["values"].count()),
            "sum": float(frame["values"].sum()),
            "mean": float(np.mean(numeric_values)),
            "min": float(np.min(numeric_values)),
            "max": float(np.max(numeric_values)),
        }
    else:
        serialized = str(task_payload)
        result = {
            "count": 0,
            "message": "No numeric values found. Payload was processed as text.",
            "textLength": len(serialized),
        }

    return jsonify(
        {
            "jobId": job_id,
            "processedAt": datetime.now(timezone.utc).isoformat(),
            "result": result,
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

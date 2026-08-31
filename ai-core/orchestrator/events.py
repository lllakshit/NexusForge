from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from nats.aio.client import Client as NATS

from config.loader import EventSettings
from router_service.models import ExecuteRequest

logger = logging.getLogger(__name__)


class EventSubscriber:
    """Subscribes to NexusForge events and pushes tasks into orchestrator queue."""

    def __init__(self, settings: EventSettings, orchestrator: Any) -> None:
        self.settings = settings
        self.orchestrator = orchestrator
        self.nc: NATS | None = None
        self._subscriptions: list[Any] = []
        self._connected = False

    async def start(self) -> None:
        if not self.settings.enabled or self._connected:
            return

        self.nc = NATS()
        try:
            await self.nc.connect(servers=[self.settings.nats_url])
        except Exception as exc:
            logger.warning("NATS unavailable; AI Core will run without events: %s", exc)
            self.nc = None
            return
        self._connected = True

        for subject in self.settings.subjects:
            full_subject = (
                subject if subject.startswith(f"{self.settings.subject_prefix}.") else f"{self.settings.subject_prefix}.{subject}"
            )
            subscription = await self.nc.subscribe(full_subject, cb=self._on_message)
            self._subscriptions.append(subscription)
            logger.info("Subscribed to event subject: %s", full_subject)

    async def stop(self) -> None:
        if self.nc and self._connected:
            await self.nc.drain()
        self._connected = False
        self._subscriptions.clear()

    async def _on_message(self, message: Any) -> None:
        try:
            payload = json.loads(message.data.decode("utf-8"))
        except Exception:
            logger.warning("Failed to decode event payload from subject=%s", message.subject)
            return

        event_type = str(payload.get("type") or self._subject_to_event_type(message.subject))
        event_data = payload.get("data", {})
        if not isinstance(event_data, dict):
            event_data = {"raw": event_data}

        task_text = self._to_task_prompt(event_type=event_type, data=event_data)
        if not task_text:
            return

        request = ExecuteRequest(
            task=task_text,
            task_type=event_data.get("task_type"),
            metadata={"source_event": event_type, "event_payload": event_data},
            correlation_id=payload.get("correlationId"),
        )

        # Avoid blocking the NATS callback loop on long-running execution.
        asyncio.create_task(self.orchestrator.submit_background(request=request, source_event=event_type))

    @staticmethod
    def _subject_to_event_type(subject: str) -> str:
        if subject.startswith("nexusforge."):
            return subject.replace("nexusforge.", "", 1)
        return subject

    @staticmethod
    def _to_task_prompt(event_type: str, data: dict[str, Any]) -> str:
        if event_type == "task.created":
            title = str(data.get("title", "")).strip()
            body = str(data.get("task", data.get("description", ""))).strip()
            return f"{title}\n{body}".strip()

        if event_type == "repo.updated":
            repo = str(data.get("repo", data.get("repository", "unknown-repo")))
            diff = str(data.get("diff_summary", data.get("changes", data)))
            return (
                f"Analyze repository update for {repo}. "
                f"Summarize impact, required implementation steps, and risk review.\nChanges: {diff}"
            )

        if event_type == "job.requested":
            job_name = str(data.get("job_name", data.get("name", "unnamed-job")))
            requirements = str(data.get("requirements", data.get("payload", data)))
            return f"Plan and execute job request '{job_name}'. Requirements: {requirements}"

        return ""


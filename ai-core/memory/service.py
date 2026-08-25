from __future__ import annotations

import hashlib
import math
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from config.loader import MemorySettings
from memory.chroma_store import ChromaStore
from memory.sqlite_store import SQLiteStore
from router_service.models import AgentExecutionResult, ExecuteRequest, RouteDecision


class MemoryService:
    """Combines SQLite logs and Chroma embeddings for retrieval."""

    def __init__(self, settings: MemorySettings, local_gateway: Any) -> None:
        self.settings = settings
        self.local_gateway = local_gateway
        self.sqlite_store = SQLiteStore(settings.sqlite_path)
        self.chroma_store = ChromaStore(settings.chroma_path, settings.collection_name)

    async def initialize(self) -> None:
        await self.sqlite_store.initialize()

    async def record_task_start(
        self,
        task_id: str,
        request: ExecuteRequest,
        correlation_id: str,
        source_event: str | None,
    ) -> None:
        await self.sqlite_store.create_task(
            task_id=task_id,
            correlation_id=correlation_id,
            source_event=source_event,
            task_input=request.task,
            task_type=request.task_type,
        )

    async def record_route_decision(self, task_id: str, decision: RouteDecision) -> None:
        await self.sqlite_store.update_route(
            task_id=task_id,
            route_mode=decision.route_mode,
            route_decision=decision.model_dump(),
        )

        route_summary = (
            f"task_id={task_id}; route_mode={decision.route_mode}; "
            f"task_type={decision.task_type}; complexity={decision.complexity_score}; "
            f"steps={[step.step_name for step in decision.steps]}"
        )
        await self._store_embedding_document(
            doc_id=f"{task_id}:route",
            document=route_summary,
            metadata={"kind": "route", "task_id": task_id, "created_at": decision.created_at},
        )

    async def record_agent_result(self, task_id: str, result: AgentExecutionResult, prompt: str) -> None:
        await self.sqlite_store.add_agent_result(
            log_id=str(uuid4()),
            task_id=task_id,
            step_name=result.step_name,
            agent_name=result.agent_name,
            model_route=result.model_route,
            prompt=prompt,
            output=result.output,
            success=result.success,
            attempts=result.attempts,
            duration_ms=result.duration_ms,
            error=result.error,
        )

        doc = (
            f"task_id={task_id}\n"
            f"step={result.step_name}\n"
            f"agent={result.agent_name}\n"
            f"model_route={result.model_route}\n"
            f"output={result.output[:4000]}"
        )
        await self._store_embedding_document(
            doc_id=f"{task_id}:{result.step_id}",
            document=doc,
            metadata={
                "kind": "agent_result",
                "task_id": task_id,
                "step_id": result.step_id,
                "step_name": result.step_name,
                "agent_name": result.agent_name,
                "model_route": result.model_route,
            },
        )

    async def complete_task(self, task_id: str, final_output: str, status: str) -> None:
        await self.sqlite_store.complete_task(task_id=task_id, final_output=final_output, status=status)
        await self._store_embedding_document(
            doc_id=f"{task_id}:final",
            document=final_output[:6000],
            metadata={
                "kind": "final_output",
                "task_id": task_id,
                "status": status,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    async def get_task_snapshot(self, task_id: str) -> dict[str, Any] | None:
        return await self.sqlite_store.get_task(task_id)

    async def search_tasks(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        return await self.sqlite_store.search_tasks(query=query, limit=limit)

    async def retrieve_related(self, query: str, limit: int | None = None) -> list[dict[str, Any]]:
        result_limit = limit or self.settings.retrieval_limit
        embedding = await self._build_embedding(query)
        raw = await self.chroma_store.query(embedding=embedding, limit=result_limit)

        ids = raw.get("ids", [[]])[0] if raw.get("ids") else []
        documents = raw.get("documents", [[]])[0] if raw.get("documents") else []
        metadatas = raw.get("metadatas", [[]])[0] if raw.get("metadatas") else []
        distances = raw.get("distances", [[]])[0] if raw.get("distances") else []

        merged: list[dict[str, Any]] = []
        for index, doc_id in enumerate(ids):
            merged.append(
                {
                    "id": doc_id,
                    "document": documents[index] if index < len(documents) else "",
                    "metadata": metadatas[index] if index < len(metadatas) else {},
                    "distance": distances[index] if index < len(distances) else None,
                }
            )
        return merged

    async def _store_embedding_document(self, doc_id: str, document: str, metadata: dict[str, Any]) -> None:
        embedding = await self._build_embedding(document)
        await self.chroma_store.upsert(doc_id=doc_id, document=document, embedding=embedding, metadata=metadata)

    async def _build_embedding(self, text: str) -> list[float]:
        compact_text = text[:3000]
        vector: list[float] = []
        try:
            vector = await self.local_gateway.embeddings(compact_text)
        except Exception:
            vector = []

        if not vector:
            vector = self._hash_embedding(compact_text, self.settings.embedding_dimensions)
        return self._normalize_embedding(vector, self.settings.embedding_dimensions)

    @staticmethod
    def _normalize_embedding(vector: list[float], target_dim: int) -> list[float]:
        if not vector:
            vector = [0.0] * target_dim

        if len(vector) >= target_dim:
            clipped = vector[:target_dim]
        else:
            clipped = vector + [0.0] * (target_dim - len(vector))

        norm = math.sqrt(sum(value * value for value in clipped)) or 1.0
        return [float(value / norm) for value in clipped]

    @staticmethod
    def _hash_embedding(text: str, dim: int) -> list[float]:
        vector = [0.0] * dim
        for token in text.lower().split():
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], byteorder="big") % dim
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        return vector


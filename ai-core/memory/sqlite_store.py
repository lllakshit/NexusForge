from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite


class SQLiteStore:
    """Async SQLite store for task and agent execution logs."""

    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    async def initialize(self) -> None:
        async with aiosqlite.connect(self.db_path) as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS task_logs (
                    task_id TEXT PRIMARY KEY,
                    correlation_id TEXT NOT NULL,
                    source_event TEXT,
                    task_input TEXT NOT NULL,
                    task_type TEXT,
                    route_mode TEXT,
                    route_decision TEXT,
                    final_output TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_logs (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    step_name TEXT NOT NULL,
                    agent_name TEXT NOT NULL,
                    model_route TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    output TEXT NOT NULL,
                    success INTEGER NOT NULL,
                    attempts INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(task_id) REFERENCES task_logs(task_id)
                )
                """
            )
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_agent_logs_task_id ON agent_logs(task_id)")
            await conn.commit()

    async def create_task(
        self,
        task_id: str,
        correlation_id: str,
        source_event: str | None,
        task_input: str,
        task_type: str | None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as conn:
            await conn.execute(
                """
                INSERT INTO task_logs (
                    task_id, correlation_id, source_event, task_input, task_type, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (task_id, correlation_id, source_event, task_input, task_type, "running", now, now),
            )
            await conn.commit()

    async def update_route(self, task_id: str, route_mode: str, route_decision: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        serialized = json.dumps(route_decision, ensure_ascii=True)
        async with aiosqlite.connect(self.db_path) as conn:
            await conn.execute(
                """
                UPDATE task_logs
                SET route_mode = ?, route_decision = ?, updated_at = ?
                WHERE task_id = ?
                """,
                (route_mode, serialized, now, task_id),
            )
            await conn.commit()

    async def add_agent_result(
        self,
        log_id: str,
        task_id: str,
        step_name: str,
        agent_name: str,
        model_route: str,
        prompt: str,
        output: str,
        success: bool,
        attempts: int,
        duration_ms: int,
        error: str | None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as conn:
            await conn.execute(
                """
                INSERT INTO agent_logs (
                    id, task_id, step_name, agent_name, model_route, prompt, output, success,
                    attempts, duration_ms, error, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    log_id,
                    task_id,
                    step_name,
                    agent_name,
                    model_route,
                    prompt,
                    output,
                    1 if success else 0,
                    attempts,
                    duration_ms,
                    error,
                    now,
                ),
            )
            await conn.commit()

    async def complete_task(self, task_id: str, final_output: str, status: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as conn:
            await conn.execute(
                """
                UPDATE task_logs
                SET final_output = ?, status = ?, updated_at = ?
                WHERE task_id = ?
                """,
                (final_output, status, now, task_id),
            )
            await conn.commit()

    async def get_task(self, task_id: str) -> dict[str, Any] | None:
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            task_cursor = await conn.execute("SELECT * FROM task_logs WHERE task_id = ?", (task_id,))
            task_row = await task_cursor.fetchone()
            if task_row is None:
                return None

            logs_cursor = await conn.execute(
                "SELECT * FROM agent_logs WHERE task_id = ? ORDER BY created_at ASC",
                (task_id,),
            )
            logs = [dict(row) for row in await logs_cursor.fetchall()]
            payload = dict(task_row)
            payload["agent_logs"] = logs
            return payload

    async def search_tasks(self, query: str, limit: int) -> list[dict[str, Any]]:
        pattern = f"%{query}%"
        async with aiosqlite.connect(self.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                """
                SELECT task_id, correlation_id, source_event, task_input, task_type, route_mode, status, updated_at
                FROM task_logs
                WHERE task_input LIKE ? OR final_output LIKE ?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (pattern, pattern, limit),
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]


from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from agent_service.executor import AgentExecutor
from config.loader import AppConfig
from memory.service import MemoryService
from router_service.models import AgentExecutionResult, ExecuteRequest, ExecuteResponse, RouteDecision, RouteRequest, RouteStep
from router_service.router import RouterEngine

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class QueuedExecution:
    request: ExecuteRequest
    source_event: str | None
    future: asyncio.Future[ExecuteResponse] | None


class TaskOrchestrator:
    """Async orchestrator with queueing, retries, and hybrid execution."""

    def __init__(
        self,
        config: AppConfig,
        router_engine: RouterEngine,
        agent_executor: AgentExecutor,
        memory_service: MemoryService,
    ) -> None:
        self.config = config
        self.router_engine = router_engine
        self.agent_executor = agent_executor
        self.memory_service = memory_service
        self.queue: asyncio.Queue[QueuedExecution] = asyncio.Queue(maxsize=config.agent_limits.queue_maxsize)
        self.local_semaphore = asyncio.Semaphore(config.agent_limits.max_local_agents)
        self.cloud_semaphore = asyncio.Semaphore(config.agent_limits.max_parallel_cloud_agents)
        self.worker_count = 2
        self._worker_tasks: list[asyncio.Task[None]] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for worker_id in range(self.worker_count):
            task = asyncio.create_task(self._worker_loop(worker_id), name=f"ai-core-worker-{worker_id}")
            self._worker_tasks.append(task)

    async def stop(self) -> None:
        self._running = False
        for task in self._worker_tasks:
            task.cancel()
        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)
        self._worker_tasks.clear()

    async def submit(self, request: ExecuteRequest) -> ExecuteResponse:
        future: asyncio.Future[ExecuteResponse] = asyncio.get_running_loop().create_future()
        await self.queue.put(QueuedExecution(request=request, source_event=None, future=future))
        return await future

    async def submit_background(self, request: ExecuteRequest, source_event: str) -> None:
        await self.queue.put(QueuedExecution(request=request, source_event=source_event, future=None))

    async def _worker_loop(self, worker_id: int) -> None:
        while self._running:
            try:
                item = await self.queue.get()
            except asyncio.CancelledError:
                break

            try:
                response = await self._execute(item.request, source_event=item.source_event)
                if item.future and not item.future.done():
                    item.future.set_result(response)
            except Exception as exc:  # pragma: no cover - worker safeguards background tasks
                logger.exception("Worker %s failed to execute task", worker_id)
                if item.future and not item.future.done():
                    item.future.set_exception(exc)
            finally:
                self.queue.task_done()

    async def _execute(self, request: ExecuteRequest, source_event: str | None) -> ExecuteResponse:
        created_at = datetime.now(timezone.utc).isoformat()
        correlation_id = request.correlation_id or f"ai-core-{uuid4()}"

        route_request = RouteRequest(
            task=request.task,
            task_type=request.task_type,
            reasoning_depth=request.reasoning_depth,
            metadata=request.metadata,
        )
        route_decision = await self.router_engine.route_task(route_request)
        task_id = route_decision.task_id
        await self.memory_service.record_task_start(task_id, request, correlation_id, source_event)
        await self.memory_service.record_route_decision(task_id, route_decision)

        results: list[AgentExecutionResult] = []
        prior_results: dict[str, str] = {}
        status = "completed"
        final_output = ""

        try:
            for stage in sorted({step.stage for step in route_decision.steps}):
                stage_steps = [step for step in route_decision.steps if step.stage == stage]
                cloud_steps = [step for step in stage_steps if step.model_route == "cloud"]
                local_steps = [step for step in stage_steps if step.model_route == "local"]

                if cloud_steps:
                    cloud_results = await asyncio.gather(
                        *[
                            self._execute_step_with_retries(task_id, step, request.task, dict(prior_results))
                            for step in cloud_steps
                        ]
                    )
                    for result in cloud_results:
                        results.append(result)
                        prior_results[result.step_name] = result.output

                for step in local_steps:
                    result = await self._execute_step_with_retries(task_id, step, request.task, dict(prior_results))
                    results.append(result)
                    prior_results[result.step_name] = result.output

            if any(not result.success for result in results):
                status = "failed"
            final_output = self._compose_final_output(request.task, results, route_decision)
        except Exception as exc:
            status = "failed"
            final_output = f"Execution failed: {exc}"
            logger.exception("Task execution failed for task_id=%s", task_id)

        completed_at = datetime.now(timezone.utc).isoformat()
        await self.memory_service.complete_task(task_id=task_id, final_output=final_output, status=status)
        return ExecuteResponse(
            task_id=task_id,
            correlation_id=correlation_id,
            source_event=source_event,
            status=status,
            route_decision=route_decision,
            results=results,
            final_output=final_output,
            created_at=created_at,
            completed_at=completed_at,
        )

    async def _execute_step_with_retries(
        self,
        task_id: str,
        step: RouteStep,
        task_input: str,
        prior_results: dict[str, str],
    ) -> AgentExecutionResult:
        max_attempts = max(1, self.config.agent_limits.retries + 1)
        backoff = max(0.0, self.config.agent_limits.retry_backoff_seconds)
        last_error = ""

        for attempt in range(1, max_attempts + 1):
            started = time.perf_counter()
            try:
                run_output = await self._execute_step(step, task_input, prior_results)
                duration_ms = int((time.perf_counter() - started) * 1000)
                result = AgentExecutionResult(
                    step_id=step.step_id,
                    step_name=step.step_name,
                    agent_name=step.agent_name,
                    model_route=step.model_route,
                    output=run_output.output,
                    success=True,
                    attempts=attempt,
                    duration_ms=duration_ms,
                )
                await self.memory_service.record_agent_result(task_id=task_id, result=result, prompt=run_output.prompt)
                return result
            except Exception as exc:
                last_error = str(exc)
                if attempt >= max_attempts:
                    duration_ms = int((time.perf_counter() - started) * 1000)
                    failed = AgentExecutionResult(
                        step_id=step.step_id,
                        step_name=step.step_name,
                        agent_name=step.agent_name,
                        model_route=step.model_route,
                        output="",
                        success=False,
                        attempts=attempt,
                        duration_ms=duration_ms,
                        error=last_error,
                    )
                    await self.memory_service.record_agent_result(
                        task_id=task_id,
                        result=failed,
                        prompt=f"Step {step.step_name} failed to produce output.",
                    )
                    return failed
                await asyncio.sleep(backoff * attempt)

        raise RuntimeError(f"Step {step.step_name} failed: {last_error}")

    async def _execute_step(
        self,
        step: RouteStep,
        task_input: str,
        prior_results: dict[str, str],
    ) -> Any:
        semaphore = self.local_semaphore if step.model_route == "local" else self.cloud_semaphore
        async with semaphore:
            return await self.agent_executor.execute_step(step, task_input, prior_results)

    @staticmethod
    def _compose_final_output(task_input: str, results: list[AgentExecutionResult], decision: RouteDecision) -> str:
        lines = [
            f"Task: {task_input}",
            f"Route mode: {decision.route_mode}",
            f"Complexity score: {decision.complexity_score}",
            "",
        ]
        for result in results:
            status = "ok" if result.success else "failed"
            lines.append(
                f"[{result.step_name}] agent={result.agent_name} model={result.model_route} status={status}\n"
                f"{result.output if result.output else result.error or ''}\n"
            )
        return "\n".join(lines).strip()

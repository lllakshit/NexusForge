from __future__ import annotations

import json
import logging
import re
from typing import Any, Sequence
from uuid import uuid4

from config.loader import AppConfig
from model_cloud.cloud_gateway import CloudGateway
from model_local.ollama_gateway import OllamaGateway
from router_service.models import ModelRoute, RouteDecision, RouteRequest, RouteStep, TaskType

logger = logging.getLogger(__name__)


class RouterEngine:
    """Task router that chooses local/cloud execution and creates agent steps."""

    def __init__(self, config: AppConfig, local_gateway: OllamaGateway, cloud_gateway: CloudGateway) -> None:
        self.config = config
        self.local_gateway = local_gateway
        self.cloud_gateway = cloud_gateway
        self.thresholds = config.routing_thresholds

    async def route_task(self, request: RouteRequest) -> RouteDecision:
        task = request.task.strip()
        task_type = request.task_type or self._infer_task_type(task)
        token_estimate = self._estimate_tokens(task)
        reasoning_depth = request.reasoning_depth or self._infer_reasoning_depth(task)

        complexity_score = self._score_complexity(
            task=task,
            task_type=task_type,
            token_estimate=token_estimate,
            reasoning_depth=reasoning_depth,
        )
        route_mode = self._choose_route_mode(task, task_type, complexity_score, reasoning_depth)
        complexity_level = self._complexity_level(complexity_score)

        if self._cloud_only():
            route_mode = "cloud"
        else:
            local_signal = await self._analyze_route_with_local_model(task, task_type, reasoning_depth)
            if local_signal:
                suggested_mode = local_signal.get("recommendation")
                if suggested_mode in {"local", "cloud", "mixed"}:
                    route_mode = suggested_mode

        steps = self._build_steps(task, task_type, route_mode, complexity_score)
        reasoning = self._build_reasoning(task_type, complexity_score, token_estimate, reasoning_depth, route_mode)

        return RouteDecision(
            task_id=str(uuid4()),
            task_type=task_type,
            complexity_level=complexity_level,
            complexity_score=round(complexity_score, 2),
            route_mode=route_mode,
            token_estimate=token_estimate,
            reasoning_depth=reasoning_depth,
            reasoning=reasoning,
            steps=steps,
        )

    async def invoke_model(
        self,
        model_route: ModelRoute,
        prompt: str | None = None,
        messages: Sequence[dict[str, str]] | None = None,
    ) -> str:
        payload = list(messages) if messages else [{"role": "user", "content": prompt or ""}]
        if model_route == "local" and not self._cloud_only():
            return str(await self.local_gateway.chat(messages=payload, stream=False))
        return str(await self.cloud_gateway.chat(messages=payload, stream=False))

    def _cloud_only(self) -> bool:
        return getattr(self.config.routing, "mode", "hybrid") == "cloud"

    async def _analyze_route_with_local_model(
        self,
        task: str,
        task_type: TaskType,
        reasoning_depth: int,
    ) -> dict[str, Any] | None:
        prompt = (
            "Classify this task for routing.\n"
            "Return compact JSON with fields recommendation(local|cloud|mixed), rationale.\n"
            f"task_type={task_type}\n"
            f"reasoning_depth={reasoning_depth}\n"
            f"task={task}"
        )
        try:
            raw = await self.local_gateway.generate(prompt=prompt, stream=False)
            return self._extract_json(str(raw))
        except Exception as exc:
            logger.debug("Local route analysis unavailable: %s", exc)
            return None

    @staticmethod
    def _extract_json(value: str) -> dict[str, Any] | None:
        match = re.search(r"\{.*\}", value, flags=re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    @staticmethod
    def _estimate_tokens(task: str) -> int:
        words = len(task.split())
        return max(1, int(words * 1.35))

    def _infer_reasoning_depth(self, task: str) -> int:
        depth = 3
        if re.search(r"\b(architecture|distributed|scalable|design)\b", task, flags=re.IGNORECASE):
            depth += 3
        if re.search(r"\b(research|compare|analyze|investigate)\b", task, flags=re.IGNORECASE):
            depth += 2
        if re.search(r"\b(code|api|service|bug|refactor)\b", task, flags=re.IGNORECASE):
            depth += 1
        return min(10, depth)

    def _infer_task_type(self, task: str) -> TaskType:
        lowered = task.lower()
        if any(keyword in lowered for keyword in ["kubernetes", "terraform", "docker", "ci/cd", "infrastructure"]):
            return "infra"
        if any(keyword in lowered for keyword in ["research", "study", "benchmark", "compare"]):
            return "research"
        if any(keyword in lowered for keyword in ["architecture", "design", "scalability", "system design"]):
            return "architecture"
        if any(keyword in lowered for keyword in ["code", "api", "endpoint", "class", "function", "bug", "refactor"]):
            return "code"
        return "general"

    def _score_complexity(self, task: str, task_type: TaskType, token_estimate: int, reasoning_depth: int) -> float:
        token_ratio = token_estimate / max(1, self.thresholds.local_token_limit)
        task_weight = {
            "code": 1.3,
            "research": 2.2,
            "architecture": 2.5,
            "infra": 1.8,
            "general": 1.0,
        }[task_type]
        multi_constraint_bonus = 0.9 if " and " in task.lower() else 0.0
        return (token_ratio * 3.0) + (reasoning_depth * 0.55) + task_weight + multi_constraint_bonus

    def _choose_route_mode(self, task: str, task_type: TaskType, complexity_score: float, reasoning_depth: int) -> str:
        if self._cloud_only():
            return "cloud"
        if self._is_mixed_task(task):
            return "mixed"

        if (
            complexity_score >= self.thresholds.cloud_complexity_threshold
            or reasoning_depth >= self.thresholds.high_reasoning_depth
            or task_type in {"research", "architecture"}
        ):
            return "cloud"

        if complexity_score >= self.thresholds.mixed_complexity_threshold:
            return "mixed"

        return "local"

    @staticmethod
    def _is_mixed_task(task: str) -> bool:
        lowered = task.lower()
        has_code = any(word in lowered for word in ["code", "build", "implement", "api", "service"])
        has_research = any(word in lowered for word in ["research", "analyze", "investigate", "compare"])
        has_arch = any(word in lowered for word in ["architecture", "design", "scalability", "infra", "kubernetes"])
        has_service_scope = any(word in lowered for word in ["service", "platform", "system", "microservice"])
        return has_code and (has_research or has_arch or has_service_scope)

    @staticmethod
    def _complexity_level(complexity_score: float) -> str:
        if complexity_score >= 6.5:
            return "high"
        if complexity_score >= 4.0:
            return "medium"
        return "low"

    def _build_steps(self, task: str, task_type: TaskType, route_mode: str, complexity_score: float) -> list[RouteStep]:
        steps: list[RouteStep] = []

        def add_step(
            step_name: str,
            stage: int,
            agent_name: str,
            step_type: str,
            model_route: str,
            parallelizable: bool,
            input_hint: str,
        ) -> None:
            steps.append(
                RouteStep(
                    step_id=f"step-{len(steps) + 1}",
                    step_name=step_name,
                    stage=stage,
                    agent_name=agent_name,  # type: ignore[arg-type]
                    step_type=step_type,
                    model_route=model_route,  # type: ignore[arg-type]
                    parallelizable=parallelizable,
                    input_hint=input_hint,
                )
            )

        if route_mode == "mixed":
            add_step("planning", 1, "planner_agent", "plan", "cloud", False, "Define execution plan and milestones.")
            if task_type in {"research", "architecture"} or "research" in task.lower():
                add_step(
                    "research", 1, "research_agent", "research", "cloud", True, "Collect architecture and design insights."
                )
            local_or_cloud = "cloud" if self._cloud_only() else "local"
            if task_type in {"code", "architecture", "general"}:
                add_step("coding", 2, "coder_agent", "code", local_or_cloud, False, "Build implementation deliverables.")
            if task_type in {"infra", "architecture"}:
                add_step("infrastructure", 2, "infra_agent", "infra", local_or_cloud, False, "Define infra and deployment needs.")
            add_step("review", 3, "critic_agent", "review", "cloud", False, "Review quality, risk, and gaps.")
            add_step("memory_update", 4, "memory_agent", "memory", local_or_cloud, False, "Summarize and persist key outputs.")
            return steps

        primary_agent = self._primary_agent_for_type(task_type)
        primary_model_route = "cloud" if route_mode == "cloud" else "local"
        add_step(
            "primary_execution",
            1,
            primary_agent,
            task_type,
            primary_model_route,
            False,
            "Complete the core task requirement.",
        )

        if route_mode == "cloud" and complexity_score >= self.thresholds.cloud_complexity_threshold:
            add_step("quality_review", 2, "critic_agent", "review", "cloud", False, "Review and harden the output.")

        add_step(
            "memory_update",
            3,
            "memory_agent",
            "memory",
            "cloud" if self._cloud_only() else "local",
            False,
            "Persist context and decisions.",
        )
        return steps

    @staticmethod
    def _primary_agent_for_type(task_type: TaskType) -> str:
        mapping = {
            "code": "coder_agent",
            "research": "research_agent",
            "architecture": "planner_agent",
            "infra": "infra_agent",
            "general": "planner_agent",
        }
        return mapping[task_type]

    @staticmethod
    def _build_reasoning(
        task_type: TaskType,
        complexity_score: float,
        token_estimate: int,
        reasoning_depth: int,
        route_mode: str,
    ) -> list[str]:
        return [
            f"Task type detected as '{task_type}'.",
            f"Estimated token load: {token_estimate}.",
            f"Reasoning depth target: {reasoning_depth}.",
            f"Composite complexity score: {round(complexity_score, 2)}.",
            f"Selected route mode: {route_mode}.",
        ]

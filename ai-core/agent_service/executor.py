from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from agent_service.agents import AgentRegistry
from router_service.models import RouteStep

if TYPE_CHECKING:
    from memory.service import MemoryService
    from router_service.router import RouterEngine


@dataclass(slots=True)
class AgentRunOutput:
    prompt: str
    output: str


class AgentExecutor:
    """Executes agent steps through router-dispatched model calls."""

    def __init__(self, agent_registry: AgentRegistry, router_engine: "RouterEngine", memory_service: "MemoryService") -> None:
        self.agent_registry = agent_registry
        self.router_engine = router_engine
        self.memory_service = memory_service

    async def execute_step(self, step: RouteStep, task_input: str, prior_results: dict[str, str]) -> AgentRunOutput:
        profile = self.agent_registry.get(step.agent_name)
        retrieved_context = await self.memory_service.retrieve_related(task_input, limit=2)
        prompt = self._build_prompt(
            role=profile.role,
            goal=profile.goal,
            step=step,
            task_input=task_input,
            prior_results=prior_results,
            retrieved_context=retrieved_context,
        )

        messages = [
            {
                "role": "system",
                "content": (
                    f"You are {profile.role}. "
                    f"Use concise, actionable output. "
                    f"Execution method: {profile.execution_method}. "
                    "You must follow the step objective exactly."
                ),
            },
            {"role": "user", "content": prompt},
        ]
        output = await self.router_engine.invoke_model(model_route=step.model_route, messages=messages)
        return AgentRunOutput(prompt=prompt, output=output.strip())

    @staticmethod
    def _build_prompt(
        role: str,
        goal: str,
        step: RouteStep,
        task_input: str,
        prior_results: dict[str, str],
        retrieved_context: list[dict[str, str]],
    ) -> str:
        context_lines = []
        for key, value in prior_results.items():
            trimmed = value[:1500]
            context_lines.append(f"- {key}: {trimmed}")

        memory_lines = []
        for item in retrieved_context:
            text = str(item.get("document", ""))[:1000]
            memory_lines.append(f"- {text}")

        return (
            f"Agent Role: {role}\n"
            f"Agent Goal: {goal}\n"
            f"Step: {step.step_name}\n"
            f"Step Objective: {step.input_hint}\n"
            f"Task: {task_input}\n"
            f"Prior Step Results:\n{chr(10).join(context_lines) if context_lines else '- none'}\n"
            f"Retrieved Memory:\n{chr(10).join(memory_lines) if memory_lines else '- none'}\n"
            "Return output in plain text with clear sections when relevant."
        )


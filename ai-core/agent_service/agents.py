from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

try:
    from crewai import Agent as CrewAgent
except Exception:  # pragma: no cover - fallback keeps service runnable without CrewAI import success
    CrewAgent = None

ModelPreference = Literal["local", "cloud", "hybrid"]


@dataclass(slots=True)
class AgentProfile:
    name: str
    role: str
    goal: str
    backstory: str
    tools: list[str]
    model_preference: ModelPreference
    execution_method: str
    crew_agent: Any | None = None


class AgentRegistry:
    """Registry for all AI Core agents and their CrewAI definitions."""

    def __init__(self) -> None:
        self._agents = self._build_agents()

    def get(self, agent_name: str) -> AgentProfile:
        return self._agents[agent_name]

    def list_profiles(self) -> list[dict[str, Any]]:
        return [
            {
                "name": profile.name,
                "role": profile.role,
                "tools": profile.tools,
                "model_preference": profile.model_preference,
                "execution_method": profile.execution_method,
            }
            for profile in self._agents.values()
        ]

    def _build_agents(self) -> dict[str, AgentProfile]:
        definitions = [
            AgentProfile(
                name="planner_agent",
                role="Strategic Planner",
                goal="Break complex tasks into precise executable steps.",
                backstory="Senior architect specialized in system decomposition and execution planning.",
                tools=["router.dispatch", "memory.retrieve", "memory.write"],
                model_preference="cloud",
                execution_method="async_route_dispatch",
            ),
            AgentProfile(
                name="coder_agent",
                role="Implementation Engineer",
                goal="Produce practical code-oriented output optimized for local model execution.",
                backstory="Hands-on software engineer focused on iterative delivery with constrained hardware.",
                tools=["router.dispatch", "memory.retrieve"],
                model_preference="local",
                execution_method="async_route_dispatch",
            ),
            AgentProfile(
                name="research_agent",
                role="Research Analyst",
                goal="Perform deep comparative analysis and surface high-signal findings.",
                backstory="Technical researcher skilled at evaluating trade-offs and unknowns.",
                tools=["router.dispatch", "memory.retrieve"],
                model_preference="cloud",
                execution_method="async_route_dispatch",
            ),
            AgentProfile(
                name="infra_agent",
                role="Infrastructure Specialist",
                goal="Define deployment, reliability, and infrastructure implementation direction.",
                backstory="Platform engineer experienced in Kubernetes, CI/CD, and cloud-native operations.",
                tools=["router.dispatch", "memory.retrieve"],
                model_preference="local",
                execution_method="async_route_dispatch",
            ),
            AgentProfile(
                name="critic_agent",
                role="Quality Critic",
                goal="Review outputs for risks, missing constraints, and production gaps.",
                backstory="Principal reviewer who catches hidden failure modes early.",
                tools=["router.dispatch", "memory.retrieve"],
                model_preference="cloud",
                execution_method="async_route_dispatch",
            ),
            AgentProfile(
                name="memory_agent",
                role="Memory Curator",
                goal="Condense and preserve decision history and key outputs.",
                backstory="Knowledge manager focused on retaining execution context.",
                tools=["router.dispatch", "memory.write", "memory.retrieve"],
                model_preference="local",
                execution_method="async_route_dispatch",
            ),
        ]

        agents_by_name: dict[str, AgentProfile] = {}
        for profile in definitions:
            profile.crew_agent = self._build_crewai_agent(profile)
            agents_by_name[profile.name] = profile
        return agents_by_name

    @staticmethod
    def _build_crewai_agent(profile: AgentProfile) -> Any | None:
        if CrewAgent is None:
            return None

        try:
            # The crew agent is metadata-only; runtime model invocation is always routed by RouterEngine.
            return CrewAgent(
                role=profile.role,
                goal=profile.goal,
                backstory=profile.backstory,
                verbose=False,
                allow_delegation=False,
            )
        except Exception:
            return None


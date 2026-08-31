from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

AgentName = Literal[
    "planner_agent",
    "coder_agent",
    "research_agent",
    "infra_agent",
    "critic_agent",
    "memory_agent",
]
ModelRoute = Literal["local", "cloud"]
TaskType = Literal["code", "research", "architecture", "infra", "general"]
RouteMode = Literal["local", "cloud", "mixed"]
ComplexityLevel = Literal["low", "medium", "high"]


class AIBaseModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=())


class RouteRequest(AIBaseModel):
    task: str = Field(min_length=1)
    task_type: TaskType | None = None
    reasoning_depth: int | None = Field(default=None, ge=1, le=10)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RouteStep(AIBaseModel):
    step_id: str
    step_name: str
    stage: int
    step_type: str
    agent_name: AgentName
    model_route: ModelRoute
    parallelizable: bool = False
    input_hint: str = ""


class RouteDecision(AIBaseModel):
    task_id: str
    task_type: TaskType
    complexity_level: ComplexityLevel
    complexity_score: float
    route_mode: RouteMode
    token_estimate: int
    reasoning_depth: int
    reasoning: list[str] = Field(default_factory=list)
    steps: list[RouteStep] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ExecuteRequest(AIBaseModel):
    task: str = Field(min_length=1)
    task_type: TaskType | None = None
    reasoning_depth: int | None = Field(default=None, ge=1, le=10)
    metadata: dict[str, Any] = Field(default_factory=dict)
    correlation_id: str | None = None


class ChatRequest(AIBaseModel):
    prompt: str = Field(min_length=1)
    system_prompt: str | None = None
    temperature: float = Field(default=0.2, ge=0, le=2)


class ChatResponse(AIBaseModel):
    ok: bool = True
    provider: str
    model: str
    route: str = "cloud"
    output: str


class AgentExecutionResult(AIBaseModel):
    step_id: str
    step_name: str
    agent_name: AgentName
    model_route: ModelRoute
    output: str
    success: bool
    attempts: int = 1
    duration_ms: int = 0
    error: str | None = None


class ExecuteResponse(AIBaseModel):
    task_id: str
    correlation_id: str
    source_event: str | None = None
    status: Literal["completed", "failed"]
    route_decision: RouteDecision
    results: list[AgentExecutionResult] = Field(default_factory=list)
    final_output: str
    created_at: str
    completed_at: str

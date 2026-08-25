from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from orchestrator.orchestrator import TaskOrchestrator
from router_service.models import ExecuteRequest, ExecuteResponse, RouteDecision, RouteRequest
from router_service.router import RouterEngine

router = APIRouter(tags=["ai-core"])


def get_router_engine(request: Request) -> RouterEngine:
    return request.app.state.container.router_engine


def get_orchestrator(request: Request) -> TaskOrchestrator:
    return request.app.state.container.orchestrator


@router.post("/route", response_model=RouteDecision)
async def route_task(
    payload: RouteRequest,
    router_engine: RouterEngine = Depends(get_router_engine),
) -> RouteDecision:
    return await router_engine.route_task(payload)


@router.post("/execute", response_model=ExecuteResponse)
async def execute_task(
    payload: ExecuteRequest,
    orchestrator: TaskOrchestrator = Depends(get_orchestrator),
) -> ExecuteResponse:
    return await orchestrator.submit(payload)


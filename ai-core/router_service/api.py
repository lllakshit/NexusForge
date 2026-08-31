from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request

from orchestrator.orchestrator import TaskOrchestrator
from router_service.models import ChatRequest, ChatResponse, ExecuteRequest, ExecuteResponse, RouteDecision, RouteRequest
from router_service.router import RouterEngine
from usage_stats import record_error, record_success

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


@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    router_engine: RouterEngine = Depends(get_router_engine),
) -> ChatResponse:
    messages: list[dict[str, str]] = []
    if payload.system_prompt:
        messages.append({"role": "system", "content": payload.system_prompt})
    messages.append({"role": "user", "content": payload.prompt})
    started = time.perf_counter()
    try:
        output = await router_engine.invoke_model("cloud", messages=messages)
        cloud = router_engine.cloud_gateway
        latency_ms = int((time.perf_counter() - started) * 1000)
        record_success("chat", cloud.model, latency_ms, tokens=max(1, len(payload.prompt.split()) + len(str(output).split())))
        return ChatResponse(
            provider=cloud.provider,
            model=cloud.model,
            output=str(output),
        )
    except Exception as exc:
        message = str(exc)
        record_error("chat", message.split("key=")[0])
        raise HTTPException(status_code=502, detail=message.split("key=")[0]) from exc


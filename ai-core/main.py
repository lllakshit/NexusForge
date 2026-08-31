from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth_service import router as auth_router
from usage_stats import snapshot as usage_snapshot
from agent_service.agents import AgentRegistry
from agent_service.executor import AgentExecutor
from config.loader import AppConfig, load_config
from memory.api import router as memory_router
from memory.service import MemoryService
from model_cloud.cloud_gateway import CloudGateway
from model_local.ollama_gateway import OllamaGateway
from orchestrator.events import EventSubscriber
from orchestrator.orchestrator import TaskOrchestrator
from router_service.api import router as ai_router
from router_service.router import RouterEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ai-core")


class ServiceContainer:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.local_gateway = OllamaGateway(config.local_model)
        self.cloud_gateway = CloudGateway(config.cloud_model)
        self.router_engine = RouterEngine(config, self.local_gateway, self.cloud_gateway)
        self.memory_service = MemoryService(config.memory, self.local_gateway)
        self.agent_registry = AgentRegistry()
        self.agent_executor = AgentExecutor(self.agent_registry, self.router_engine, self.memory_service)
        self.orchestrator = TaskOrchestrator(config, self.router_engine, self.agent_executor, self.memory_service)
        self.event_subscriber = EventSubscriber(config.events, self.orchestrator)

    async def startup(self) -> None:
        await self.memory_service.initialize()
        await self.orchestrator.start()
        await self.event_subscriber.start()
        logger.info("AI Core startup complete")

    async def shutdown(self) -> None:
        await self.event_subscriber.stop()
        await self.orchestrator.stop()
        await self.local_gateway.close()
        await self.cloud_gateway.close()
        logger.info("AI Core shutdown complete")


def create_app() -> FastAPI:
    config = load_config()
    container = ServiceContainer(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.container = container
        await container.startup()
        try:
            yield
        finally:
            await container.shutdown()

    app = FastAPI(
        title="NexusForge AI Core",
        version="1.0.0",
        description="Hybrid multi-agent AI orchestration service for NexusForge.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(ai_router)
    app.include_router(memory_router)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "service": "ai-core",
            "status": "ok",
            "time": datetime.now(timezone.utc).isoformat(),
            "local_model": container.config.local_model.model,
            "cloud_provider": container.config.cloud_model.provider,
            "cloud_model": container.config.cloud_model.model,
            "cloud_configured": bool(container.config.cloud_model.api_key),
            "route_mode": container.config.routing.mode,
            "queue_size": container.orchestrator.queue.qsize(),
            "usage": usage_snapshot(),
        }

    @app.get("/agents")
    async def list_agents() -> dict[str, Any]:
        return {"agents": container.agent_registry.list_profiles()}

    return app


app = create_app()


if __name__ == "__main__":
    cfg = load_config()
    uvicorn.run("main:app", host=cfg.service.host, port=cfg.service.port, reload=False)


from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from memory.service import MemoryService

router = APIRouter(prefix="/memory", tags=["memory"])


def get_memory_service(request: Request) -> MemoryService:
    return request.app.state.container.memory_service


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: str,
    memory_service: MemoryService = Depends(get_memory_service),
) -> dict:
    snapshot = await memory_service.get_task_snapshot(task_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return snapshot


@router.get("/search")
async def search_memory(
    query: str = Query(min_length=1),
    limit: int = Query(default=5, ge=1, le=20),
    memory_service: MemoryService = Depends(get_memory_service),
) -> dict:
    vector_matches = await memory_service.retrieve_related(query=query, limit=limit)
    task_matches = await memory_service.search_tasks(query=query, limit=limit)
    return {"query": query, "vector_matches": vector_matches, "task_matches": task_matches}


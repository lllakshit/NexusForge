# AI Core Integration

## Folder Structure

```text
ai-core/
  agent_service/
    __init__.py
    agents.py
    executor.py
  config/
    __init__.py
    config.yaml
    loader.py
  memory/
    __init__.py
    api.py
    chroma_store.py
    service.py
    sqlite_store.py
  model_cloud/
    __init__.py
    cloud_gateway.py
  model_local/
    __init__.py
    ollama_gateway.py
  orchestrator/
    __init__.py
    events.py
    orchestrator.py
  router_service/
    __init__.py
    api.py
    models.py
    router.py
  __init__.py
  Dockerfile
  INTEGRATION.md
  main.py
  requirements.txt
```

## Environment

```bash
set OLLAMA_BASE_URL=http://localhost:11434
set OLLAMA_MODEL=qwen2.5
set OLLAMA_PATH=F:\ollama
set CLOUD_PROVIDER=groq
set CLOUD_MODEL=llama-3.3-70b-versatile
set GROQ_API_KEY=<your-key>
set NATS_URL=nats://localhost:4222
```

## Run Local

```bash
cd ai-core
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 4011
```

## API Usage

```bash
curl -X POST http://localhost:4011/route ^
  -H "Content-Type: application/json" ^
  -d "{\"task\":\"Build API service\",\"task_type\":\"code\",\"reasoning_depth\":6}"
```

```bash
curl -X POST http://localhost:4011/execute ^
  -H "Content-Type: application/json" ^
  -d "{\"task\":\"Build API service\",\"task_type\":\"code\",\"reasoning_depth\":7}"
```

```bash
curl "http://localhost:4011/memory/search?query=Build%20API%20service&limit=5"
```

## Event Subjects

- `nexusforge.task.created`
- `nexusforge.repo.updated`
- `nexusforge.job.requested`

## Example Event

```json
{
  "id": "evt-123",
  "type": "task.created",
  "source": "gateway",
  "time": "2026-02-14T12:00:00Z",
  "correlationId": "corr-123",
  "data": {
    "title": "Build API service",
    "description": "Plan architecture, implement endpoints, and review quality"
  }
}
```


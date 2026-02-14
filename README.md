# NexusForge

NexusForge is a self-driving developer platform composed of React frontend, microservices, event backbone, Temporal workflows, policy checks, feature flags, observability, and autonomous incident remediation.

## Platform Components

- Frontend (`frontend`) with Dashboard, Projects, Jobs, Logs, Topology Viewer, Replay Viewer.
- API Gateway (`gateway`) with JWT auth, OPA authorization, feature-flag checks, tracing, and request proxying.
- Domain services: `auth-service`, `project-service`, `job-service`, `file-service`.
- Python worker (`worker-python`) for data processing workloads.
- MCP registry server (`mcp-server`) exposing resources/tools/prompts + execution.
- Incident automation service (`incident-service`) subscribing to error events and triggering runbooks.
- Event backbone (`NATS JetStream`) with a shared TypeScript SDK (`event-bus/event-sdk`).
- Workflow orchestration (`Temporal`) with worker code in `temporal/worker`.
- Data layer: PostgreSQL, MongoDB, Redis.
- Observability: OpenTelemetry Collector, Jaeger, Prometheus, Grafana.
- Policy engine: OPA with Rego policies.
- Feature flags service (`feature-flags`) integrated through OpenFeature.
- Internal developer portal (`backstage`).

## Local Run

1. Copy environment template:
   - `copy .env.example .env`
2. Build all local packages:
   - `scripts\\bootstrap.cmd`
   - `scripts\\build-all.cmd`
3. Start the platform:
   - `docker-compose up --build`

## Useful Endpoints

- Frontend: `http://localhost:3000`
- Backstage Portal: `http://localhost:7007`
- Gateway: `http://localhost:4000`
- Jaeger: `http://localhost:16686`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001` (admin/admin)
- Temporal UI: `http://localhost:8233`
- OPA API: `http://localhost:8181`

## Event Types

- `user.created`
- `project.created`
- `project.deleted`
- `job.created`
- `job.completed`
- `file.uploaded`
- `incident.detected`
- `incident.remediated`

## Identity and mTLS (Local Dev)

Services expose SPIFFE-like identities through environment variables:

- `SERVICE_SPIFFE_ID=spiffe://nexusforge.local/<service-name>`
- `MTLS_MODE=disabled` for local development

The configuration and certificate mount paths are in `docker-compose.yml` and `docker/identity`.

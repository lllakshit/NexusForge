# NexusForge Architecture

## Runtime Topology

Frontend -> Gateway -> Domain Services -> Data Stores

Event and workflow planes:

- Domain services emit events to NATS JetStream.
- Temporal orchestrates long-running workflows.
- Incident service consumes error events and triggers remediation workflows.

Control planes:

- OPA enforces authorization for routed requests.
- Feature-flags service drives canary/beta/service toggles.
- MCP server exposes machine-readable resources/tools/prompts with versioning.

Observability:

- OpenTelemetry is initialized in every Node service.
- Traces go through OTel Collector to Jaeger.
- Metrics flow through OTel Collector to Prometheus and Grafana.

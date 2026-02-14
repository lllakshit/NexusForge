# Event Backbone

NexusForge uses NATS JetStream with stream `NEXUSFORGE_EVENTS` and subjects prefixed by `nexusforge.`.

Shared SDK:

- Package: `event-bus/event-sdk`
- API:
  - `connect()`
  - `publish(type, data, { correlationId, traceId, spanId })`
  - `subscribe(type, durable, handler)`

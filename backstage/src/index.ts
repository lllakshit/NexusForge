import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(correlationMiddleware("backstage"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 7007);

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "backstage"
});

const services = [
  "gateway",
  "auth-service",
  "project-service",
  "job-service",
  "file-service",
  "mcp-server",
  "feature-flags",
  "incident-service",
  "worker-python",
  "temporal-worker"
];

app.get("/health", (_req, res) => {
  res.json({
    service: "backstage",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/", (_req, res) => {
  const html = `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>NexusForge Backstage</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 0; background: #f6f8fb; color: #102a43; }
    .wrap { max-width: 900px; margin: 32px auto; padding: 0 16px; }
    .card { background: #fff; border: 1px solid #d9e2ec; border-radius: 14px; padding: 18px; margin-bottom: 12px; }
    h1 { margin: 0 0 18px 0; }
    ul { padding-left: 20px; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>NexusForge Internal Developer Portal</h1>
    <div class="card">
      <h3>Service Catalog</h3>
      <ul>${services.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>
    <div class="card">
      <h3>Runbooks</h3>
      <ul>
        <li>Failed job pattern -> incident detected -> remediation workflow</li>
        <li>Policy denial analysis via OPA decision endpoint</li>
        <li>MCP tool execution audit via gateway correlation IDs</li>
      </ul>
    </div>
  </div>
</body>
</html>
  `;
  res.type("html").send(html);
});

const start = async (): Promise<void> => {
  await initTelemetry("backstage");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "backstage",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/backstage"
    },
    { correlationId: "boot-backstage" }
  );

  app.listen(PORT, () => {
    console.log(`[backstage] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[backstage] startup failed", error);
  process.exit(1);
});

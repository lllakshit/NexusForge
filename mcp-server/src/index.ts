import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

type RegistryEntry = {
  id: string;
  version: string;
  description: string;
  inputSchema?: Record<string, unknown>;
};

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(correlationMiddleware("mcp-server"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4005);
const PROJECT_SERVICE_URL = process.env.PROJECT_SERVICE_URL ?? "http://project-service:4002";
const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL ?? "http://job-service:4003";
const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL ?? "http://file-service:4004";

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "mcp-server"
});

const resources: RegistryEntry[] = [
  { id: "projects", version: "1.0.0", description: "Project catalog from project-service" },
  { id: "logs", version: "1.0.0", description: "Operational logs from job-service" },
  { id: "files", version: "1.0.0", description: "Uploaded files metadata from file-service" },
  { id: "job-timeline", version: "1.0.0", description: "Timeline replay for a specific job" }
];

const tools: RegistryEntry[] = [
  {
    id: "create-project",
    version: "1.0.0",
    description: "Create project through project-service",
    inputSchema: {
      type: "object",
      required: ["name", "description"],
      properties: {
        name: { type: "string" },
        description: { type: "string" }
      }
    }
  },
  {
    id: "run-job",
    version: "1.0.0",
    description: "Create a workflow-backed job",
    inputSchema: {
      type: "object",
      required: ["name", "projectId", "payload"],
      properties: {
        name: { type: "string" },
        projectId: { type: "string" },
        payload: { type: "object" }
      }
    }
  }
];

const prompts: RegistryEntry[] = [
  { id: "incident-summary", version: "1.0.0", description: "Summarize latest incidents for operators" },
  { id: "project-health", version: "1.0.0", description: "Generate project health diagnostics prompt" }
];

app.get("/health", (_req, res) => {
  res.json({
    service: "mcp-server",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/mcp/discovery", (_req, res) => {
  res.json({
    service: "nexusforge-mcp",
    version: "1.0.0",
    resourcesEndpoint: "/mcp/resources",
    toolsEndpoint: "/mcp/tools",
    promptsEndpoint: "/mcp/prompts",
    executeEndpoint: "/mcp/execute"
  });
});

app.get("/mcp/resources", (_req, res) => {
  res.json({ resources });
});

app.get("/mcp/tools", (_req, res) => {
  res.json({ tools });
});

app.get("/mcp/prompts", (_req, res) => {
  res.json({ prompts });
});

app.post("/mcp/execute", async (req, res) => {
  try {
    const { toolId, args } = req.body as { toolId?: string; args?: Record<string, unknown> };
    if (!toolId) {
      res.status(400).json({ error: "toolId is required" });
      return;
    }

    const userHeaders = {
      "x-user-id": req.header("x-user-id") ?? "",
      "x-user-roles": req.header("x-user-roles") ?? "",
      authorization: req.header("authorization") ?? ""
    };

    if (toolId === "create-project") {
      const response = await axios.post(`${PROJECT_SERVICE_URL}/projects`, args, { headers: userHeaders });
      res.json({ toolId, result: response.data });
      return;
    }

    if (toolId === "run-job") {
      const response = await axios.post(`${JOB_SERVICE_URL}/jobs`, args, { headers: userHeaders });
      res.json({ toolId, result: response.data });
      return;
    }

    if (toolId === "list-projects") {
      const response = await axios.get(`${PROJECT_SERVICE_URL}/projects`, { headers: userHeaders });
      res.json({ toolId, result: response.data });
      return;
    }

    if (toolId === "list-logs") {
      const response = await axios.get(`${JOB_SERVICE_URL}/logs`, { headers: userHeaders });
      res.json({ toolId, result: response.data });
      return;
    }

    if (toolId === "list-files") {
      const response = await axios.get(`${FILE_SERVICE_URL}/files`, { headers: userHeaders });
      res.json({ toolId, result: response.data });
      return;
    }

    if (toolId === "job-timeline") {
      const jobId = String(args?.jobId ?? "");
      const response = await axios.get(`${JOB_SERVICE_URL}/jobs/${jobId}/timeline`, { headers: userHeaders });
      res.json({ toolId, result: response.data });
      return;
    }

    res.status(404).json({ error: `Unknown tool: ${toolId}` });
  } catch (error) {
    console.error("[mcp-server] execute error", error);
    res.status(500).json({ error: "Tool execution failed" });
  }
});

const start = async (): Promise<void> => {
  await initTelemetry("mcp-server");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "mcp-server",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/mcp-server"
    },
    { correlationId: "boot-mcp-server" }
  );

  app.listen(PORT, () => {
    console.log(`[mcp-server] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[mcp-server] startup failed", error);
  process.exit(1);
});

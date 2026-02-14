import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Client, Connection } from "@temporalio/client";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

type IncidentRecord = {
  id: string;
  jobId: string;
  source: string;
  reason: string;
  status: "detected" | "remediating" | "resolved";
  createdAt: string;
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("incident-service"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4006);
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "temporal:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "nexusforge-task-queue";

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "incident-service"
});

let temporalClient: Client;
const incidents: IncidentRecord[] = [];

const triggerRemediation = async (jobId: string, reason: string, correlationId: string): Promise<void> => {
  const incident: IncidentRecord = {
    id: `${jobId}-${Date.now()}`,
    jobId,
    source: "job-service",
    reason,
    status: "remediating",
    createdAt: new Date().toISOString()
  };
  incidents.unshift(incident);

  await eventBus.publish(
    "incident.detected",
    {
      jobId,
      reason,
      detectedAt: incident.createdAt
    },
    { correlationId }
  );

  await temporalClient.workflow.start("RemediationWorkflow", {
    taskQueue: TEMPORAL_TASK_QUEUE,
    workflowId: `remediation-${jobId}-${Date.now()}`,
    args: [jobId]
  });

  incident.status = "resolved";
};

app.get("/health", (_req, res) => {
  res.json({
    service: "incident-service",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/incidents", (_req, res) => {
  res.json({ incidents });
});

app.post("/incidents/:jobId/remediate", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    await triggerRemediation(jobId, "manual-trigger", `manual-${jobId}-${Date.now()}`);
    res.status(202).json({ triggered: true, jobId });
  } catch (error) {
    console.error("[incident-service] remediation trigger error", error);
    res.status(500).json({ error: "Failed to trigger remediation" });
  }
});

const start = async (): Promise<void> => {
  await initTelemetry("incident-service");
  await eventBus.connect();

  const temporalConnection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  temporalClient = new Client({
    connection: temporalConnection,
    namespace: TEMPORAL_NAMESPACE
  });

  await eventBus.subscribe<{ jobId?: string; status?: string }>("job.completed", "incident-service-job-completed", async (event) => {
    const payload = event.data;
    if (payload.status === "failed" && payload.jobId) {
      await triggerRemediation(payload.jobId, "job-failure-pattern", event.correlationId);
    }
  });

  await eventBus.publish(
    "service.registered",
    {
      service: "incident-service",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/incident-service"
    },
    { correlationId: "boot-incident-service" }
  );

  app.listen(PORT, () => {
    console.log(`[incident-service] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[incident-service] startup failed", error);
  process.exit(1);
});

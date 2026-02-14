import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { Connection, Client } from "@temporalio/client";
import { Collection, Db, MongoClient, ObjectId } from "mongodb";
import { createClient, RedisClientType } from "redis";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, getCorrelationId, getTraceInfo, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

type JobStatus = "queued" | "running" | "completed" | "failed";

type JobHistory = {
  _id?: ObjectId;
  name: string;
  projectId: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  outputId?: ObjectId;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type JobOutput = {
  _id?: ObjectId;
  jobId: ObjectId;
  output: Record<string, unknown>;
  createdAt: Date;
};

type LogRecord = {
  _id?: ObjectId;
  level: "info" | "error";
  message: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(correlationMiddleware("job-service"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4003);
const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017/nexusforge";
const MONGO_DB = process.env.MONGO_DB ?? "nexusforge";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE ?? "default";
const TEMPORAL_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "nexusforge-task-queue";

const mongoClient = new MongoClient(MONGO_URI);
let database: Db;
let jobsCollection: Collection<JobHistory>;
let logsCollection: Collection<LogRecord>;
let outputsCollection: Collection<JobOutput>;
let redisClient: RedisClientType;
let temporalClient: Client;

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "job-service"
});

const toObjectId = (value: string): ObjectId | null => {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
};

const logEvent = async (level: "info" | "error", message: string, metadata: Record<string, unknown>) => {
  await logsCollection.insertOne({
    level,
    message,
    metadata,
    createdAt: new Date()
  });
};

const serializeJob = (job: JobHistory & { _id: ObjectId }) => ({
  id: job._id.toHexString(),
  name: job.name,
  projectId: job.projectId,
  payload: job.payload,
  status: job.status,
  outputId: job.outputId ? job.outputId.toHexString() : null,
  createdBy: job.createdBy,
  createdAt: job.createdAt.toISOString(),
  updatedAt: job.updatedAt.toISOString()
});

app.get("/health", (_req, res) => {
  res.json({
    service: "job-service",
    status: "ok",
    spiffe: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/job-service",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.post("/jobs", async (req, res) => {
  try {
    const userId = req.header("x-user-id") ?? "";
    const { name, projectId, payload } = req.body as {
      name?: string;
      projectId?: string;
      payload?: Record<string, unknown>;
    };

    if (!userId) {
      res.status(401).json({ error: "Missing user identity" });
      return;
    }

    if (!name || !projectId) {
      res.status(400).json({ error: "name and projectId are required" });
      return;
    }

    const now = new Date();
    const insertResult = await jobsCollection.insertOne({
      name,
      projectId,
      payload: payload ?? {},
      status: "queued",
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    });

    const jobId = insertResult.insertedId.toHexString();
    await redisClient.set(`job:${jobId}:status`, "queued");

    await temporalClient.workflow.start("JobLifecycleWorkflow", {
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: `job-${jobId}`,
      args: [jobId, payload ?? {}]
    });

    const correlationId = getCorrelationId(res);
    const { traceId, spanId } = getTraceInfo(res);

    await eventBus.publish(
      "job.created",
      {
        jobId,
        projectId,
        status: "queued",
        createdAt: now.toISOString()
      },
      { correlationId, traceId, spanId }
    );

    await logEvent("info", "Job created", { jobId, projectId, userId });

    res.status(201).json({
      job: {
        id: jobId,
        status: "queued"
      }
    });
  } catch (error) {
    console.error("[job-service] create job error", error);
    await logEvent("error", "Job creation failed", { error: (error as Error).message });
    res.status(500).json({ error: "Failed to create job" });
  }
});

app.get("/jobs", async (_req, res) => {
  try {
    const jobs = await jobsCollection.find().sort({ createdAt: -1 }).limit(100).toArray();
    res.json({ jobs: jobs.map((job) => serializeJob(job as JobHistory & { _id: ObjectId })) });
  } catch (error) {
    console.error("[job-service] list jobs error", error);
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

app.get("/jobs/:id/timeline", async (req, res) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const job = await jobsCollection.findOne({ _id: objectId });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const logs = await logsCollection.find({ "metadata.jobId": req.params.id }).sort({ createdAt: 1 }).toArray();
    res.json({
      job: serializeJob(job as JobHistory & { _id: ObjectId }),
      timeline: logs.map((log) => ({
        level: log.level,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error("[job-service] timeline error", error);
    res.status(500).json({ error: "Failed to fetch timeline" });
  }
});

app.get("/logs", async (_req, res) => {
  try {
    const logs = await logsCollection.find().sort({ createdAt: -1 }).limit(200).toArray();
    res.json({
      logs: logs.map((log) => ({
        id: log._id?.toHexString(),
        level: log.level,
        message: log.message,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error("[job-service] logs error", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

app.post("/internal/jobs/:id/status", async (req, res) => {
  try {
    const objectId = toObjectId(req.params.id);
    const { status, reason } = req.body as { status?: JobStatus; reason?: string };
    if (!objectId || !status) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    await jobsCollection.updateOne({ _id: objectId }, { $set: { status, updatedAt: new Date() } });
    await redisClient.set(`job:${req.params.id}:status`, status);
    await logEvent("info", "Job status updated", { jobId: req.params.id, status, reason: reason ?? "" });

    if (status === "failed") {
      await eventBus.publish(
        "job.completed",
        {
          jobId: req.params.id,
          status: "failed",
          completedAt: new Date().toISOString()
        },
        { correlationId: `internal-${req.params.id}` }
      );
    }

    res.json({ updated: true });
  } catch (error) {
    console.error("[job-service] internal status error", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.post("/internal/jobs/:id/complete", async (req, res) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const { output, status } = req.body as { output?: Record<string, unknown>; status?: JobStatus };
    const outputInsert = await outputsCollection.insertOne({
      jobId: objectId,
      output: output ?? {},
      createdAt: new Date()
    });

    await jobsCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          status: status ?? "completed",
          outputId: outputInsert.insertedId,
          updatedAt: new Date()
        }
      }
    );
    await redisClient.set(`job:${req.params.id}:status`, status ?? "completed");
    await logEvent("info", "Job completed", { jobId: req.params.id, outputId: outputInsert.insertedId.toHexString() });

    res.json({ completed: true, outputId: outputInsert.insertedId.toHexString() });
  } catch (error) {
    console.error("[job-service] complete job error", error);
    res.status(500).json({ error: "Failed to complete job" });
  }
});

app.post("/internal/jobs/:id/retry", async (req, res) => {
  try {
    const objectId = toObjectId(req.params.id);
    if (!objectId) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }

    const job = await jobsCollection.findOne({ _id: objectId });
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    await jobsCollection.updateOne({ _id: objectId }, { $set: { status: "queued", updatedAt: new Date() } });
    await temporalClient.workflow.start("JobLifecycleWorkflow", {
      taskQueue: TEMPORAL_TASK_QUEUE,
      workflowId: `job-retry-${req.params.id}-${Date.now()}`,
      args: [req.params.id, job.payload]
    });
    await logEvent("info", "Job retry triggered", { jobId: req.params.id });

    res.json({ retried: true });
  } catch (error) {
    console.error("[job-service] retry error", error);
    res.status(500).json({ error: "Failed to retry job" });
  }
});

app.post("/internal/approvals/:id/timeout", async (req, res) => {
  await logEvent("error", "Approval timed out", { requestId: req.params.id });
  res.json({ timeout: true });
});

app.post("/internal/approvals/:id/decision", async (req, res) => {
  const { approved } = req.body as { approved?: boolean };
  await logEvent("info", "Approval decision", { requestId: req.params.id, approved: Boolean(approved) });
  res.json({ decided: true });
});

const start = async (): Promise<void> => {
  await initTelemetry("job-service");
  await eventBus.connect();

  await mongoClient.connect();
  database = mongoClient.db(MONGO_DB);
  jobsCollection = database.collection<JobHistory>("job_history");
  logsCollection = database.collection<LogRecord>("logs");
  outputsCollection = database.collection<JobOutput>("job_outputs");

  await jobsCollection.createIndex({ createdAt: -1 });
  await logsCollection.createIndex({ createdAt: -1 });
  await outputsCollection.createIndex({ jobId: 1 });

  redisClient = createClient({ url: REDIS_URL });
  await redisClient.connect();

  const temporalConnection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  temporalClient = new Client({
    connection: temporalConnection,
    namespace: TEMPORAL_NAMESPACE
  });

  await eventBus.publish(
    "service.registered",
    {
      service: "job-service",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/job-service"
    },
    { correlationId: "boot-job-service" }
  );

  app.listen(PORT, () => {
    console.log(`[job-service] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[job-service] startup failed", error);
  process.exit(1);
});

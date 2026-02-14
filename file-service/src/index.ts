import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, getCorrelationId, getTraceInfo, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("file-service"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4004);
const FILE_STORAGE_PATH = process.env.FILE_STORAGE_PATH ?? path.join(process.cwd(), "data");
const TEMP_STORAGE_PATH = path.join(FILE_STORAGE_PATH, "tmp");

fs.mkdirSync(FILE_STORAGE_PATH, { recursive: true });
fs.mkdirSync(TEMP_STORAGE_PATH, { recursive: true });

const upload = multer({
  dest: TEMP_STORAGE_PATH
});

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "file-service"
});

app.get("/health", (_req, res) => {
  res.json({
    service: "file-service",
    status: "ok",
    spiffe: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/file-service",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/files", (_req, res) => {
  const files = fs
    .readdirSync(FILE_STORAGE_PATH)
    .filter((name) => name !== "tmp")
    .map((filename) => {
      const fullPath = path.join(FILE_STORAGE_PATH, filename);
      const stats = fs.statSync(fullPath);
      return {
        filename,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    });

  res.json({ files });
});

app.post("/files/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const userId = req.header("x-user-id") ?? "system";
    const sanitizedName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${sanitizedName}`;
    const destination = path.join(FILE_STORAGE_PATH, filename);
    fs.renameSync(req.file.path, destination);

    const correlationId = getCorrelationId(res);
    const { traceId, spanId } = getTraceInfo(res);

    await eventBus.publish(
      "file.uploaded",
      {
        fileId: filename,
        filename,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString()
      },
      { correlationId, traceId, spanId }
    );

    res.status(201).json({
      file: {
        fileId: filename,
        filename,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error("[file-service] upload error", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.get("/files/:filename", (req, res) => {
  const safeName = path.basename(req.params.filename);
  const fullPath = path.join(FILE_STORAGE_PATH, safeName);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.download(fullPath);
});

app.delete("/files/:filename", (req, res) => {
  const safeName = path.basename(req.params.filename);
  const fullPath = path.join(FILE_STORAGE_PATH, safeName);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  fs.unlinkSync(fullPath);
  res.json({ deleted: true, filename: safeName });
});

const start = async (): Promise<void> => {
  await initTelemetry("file-service");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "file-service",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/file-service"
    },
    { correlationId: "boot-file-service" }
  );

  app.listen(PORT, () => {
    console.log(`[file-service] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[file-service] startup failed", error);
  process.exit(1);
});

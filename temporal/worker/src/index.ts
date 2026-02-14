import dotenv from "dotenv";
import path from "node:path";
import { NativeConnection, Worker } from "@temporalio/worker";
import { EventBusClient } from "@nexusforge/event-sdk";
import { initTelemetry } from "@nexusforge/telemetry-sdk";
import * as activities from "./activities";

dotenv.config();

const start = async (): Promise<void> => {
  await initTelemetry("temporal-worker");

  const temporalAddress = process.env.TEMPORAL_ADDRESS ?? "temporal:7233";
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "nexusforge-task-queue";
  const connection = await NativeConnection.connect({ address: temporalAddress });
  const eventBus = new EventBusClient({
    natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
    streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
    sourceService: "temporal-worker"
  });
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "temporal-worker",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/temporal-worker"
    },
    { correlationId: "boot-temporal-worker" }
  );

  const workflowsPath = path.join(__dirname, "workflows.js");

  const worker = await Worker.create({
    connection,
    workflowsPath,
    activities,
    taskQueue
  });

  console.log(`[temporal-worker] connected to ${temporalAddress}, queue=${taskQueue}`);
  await worker.run();
};

start().catch((error) => {
  console.error("[temporal-worker] startup failed", error);
  process.exit(1);
});

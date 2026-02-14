import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { OpenFeature } from "@openfeature/server-sdk";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

type FlagType = "canary" | "beta" | "service";
type FlagValue = {
  key: string;
  enabled: boolean;
  type: FlagType;
  description: string;
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("feature-flags"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4010);
const featureClient = OpenFeature.getClient("feature-flags");

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "feature-flags"
});

const flags = new Map<string, FlagValue>([
  [
    "gateway.routing.enabled",
    {
      key: "gateway.routing.enabled",
      enabled: true,
      type: "service",
      description: "Global gateway routing switch"
    }
  ],
  [
    "projects.beta.timeline",
    {
      key: "projects.beta.timeline",
      enabled: true,
      type: "beta",
      description: "Enable advanced timeline view in frontend"
    }
  ],
  [
    "jobs.canary.remediation",
    {
      key: "jobs.canary.remediation",
      enabled: true,
      type: "canary",
      description: "Enable autonomous remediation flow"
    }
  ]
]);

app.get("/health", (_req, res) => {
  res.json({
    service: "feature-flags",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/flags", (_req, res) => {
  res.json({ flags: Array.from(flags.values()) });
});

app.put("/flags/:key", (req, res) => {
  const key = req.params.key;
  const existing = flags.get(key);
  if (!existing) {
    res.status(404).json({ error: "Flag not found" });
    return;
  }

  const { enabled } = req.body as { enabled?: boolean };
  existing.enabled = Boolean(enabled);
  flags.set(key, existing);
  res.json({ flag: existing });
});

app.post("/evaluate/:key", async (req, res) => {
  const key = req.params.key;
  const flag = flags.get(key);
  if (!flag) {
    res.status(404).json({ error: "Flag not found" });
    return;
  }

  const userRoles: string[] = Array.isArray(req.body.roles) ? req.body.roles : [];
  const path = String(req.body.path ?? "");

  const sdkDefault = await featureClient.getBooleanValue(
    key,
    flag.enabled,
    {
      targetingKey: String(req.body.userId ?? "anonymous"),
      roles: userRoles.join(",")
    } as any
  );

  let enabled = sdkDefault;
  if (flag.type === "canary" && path.startsWith("/incidents")) {
    enabled = userRoles.includes("admin") || flag.enabled;
  }
  if (flag.type === "beta" && path.includes("/mcp")) {
    enabled = flag.enabled && (userRoles.includes("admin") || userRoles.includes("member"));
  }

  res.json({
    key,
    enabled,
    type: flag.type
  });
});

const start = async (): Promise<void> => {
  await initTelemetry("feature-flags");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "feature-flags",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/feature-flags"
    },
    { correlationId: "boot-feature-flags" }
  );

  app.listen(PORT, () => {
    console.log(`[feature-flags] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[feature-flags] startup failed", error);
  process.exit(1);
});

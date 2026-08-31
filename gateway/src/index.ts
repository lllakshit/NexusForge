import axios, { AxiosError, Method } from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { collectDefaultMetrics, register } from "prom-client";
import { OpenFeature } from "@openfeature/server-sdk";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, getCorrelationId, getTraceInfo, initTelemetry } from "@nexusforge/telemetry-sdk";

dotenv.config();

type Identity = {
  sub: string;
  email: string;
  roles: string[];
};

type AuthenticatedRequest = Request & { identity?: Identity };

const app = express();
app.use(cors());
app.use((req, res, next) => {
  const contentType = req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    next();
    return;
  }
  express.json({ limit: "10mb" })(req, res, next);
});

const PORT = Number(process.env.GATEWAY_PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "nexusforge-dev-jwt-secret-2026";
const OPA_URL = process.env.OPA_URL ?? "http://opa:8181";
const FEATURE_FLAG_URL = process.env.FEATURE_FLAG_URL ?? "http://feature-flags:4010";

const serviceUrls = {
  auth: process.env.AUTH_SERVICE_URL ?? "http://auth-service:4001",
  project: process.env.PROJECT_SERVICE_URL ?? "http://project-service:4002",
  job: process.env.JOB_SERVICE_URL ?? "http://job-service:4003",
  file: process.env.FILE_SERVICE_URL ?? "http://file-service:4004",
  mcp: process.env.MCP_SERVICE_URL ?? "http://mcp-server:4005",
  incident: process.env.INCIDENT_SERVICE_URL ?? "http://incident-service:4006",
  ai: process.env.AI_CORE_URL ?? "http://ai-core:4011"
};

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "gateway"
});

collectDefaultMetrics();
const featureClient = OpenFeature.getClient("gateway");

const isPublicRoute = (req: Request): boolean => {
  const path = req.originalUrl.split("?")[0];
  if (req.method === "OPTIONS") return true;
  return [
    "/health",
    "/metrics",
    "/auth/register",
    "/auth/login",
    "/auth/verify",
    "/mcp/discovery"
  ].includes(path);
};

const verifyJwt = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (isPublicRoute(req)) {
    next();
    return;
  }

  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as Identity;
    req.identity = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const evaluateGatewayFlag = async (req: AuthenticatedRequest, res: Response): Promise<boolean> => {
  const fallback = await featureClient.getBooleanValue(
    "gateway.routing.enabled",
    true,
    {
      targetingKey: req.identity?.sub ?? "anonymous",
      role: req.identity?.roles.join(",") ?? "anonymous"
    } as any
  );

  try {
    const response = await axios.post(
      `${FEATURE_FLAG_URL}/evaluate/gateway.routing.enabled`,
      {
        userId: req.identity?.sub ?? "",
        roles: req.identity?.roles ?? [],
        path: req.originalUrl
      },
      {
        headers: {
          "x-correlation-id": getCorrelationId(res)
        },
        timeout: 2000
      }
    );
    return Boolean(response.data.enabled);
  } catch {
    return fallback;
  }
};

const enforcePolicy = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  if (isPublicRoute(req)) {
    next();
    return;
  }

  try {
    const input = {
      path: req.path,
      method: req.method,
      user_id: req.identity?.sub ?? "",
      roles: req.identity?.roles ?? []
    };

    const [routingEnabled, opaDecision] = await Promise.all([
      evaluateGatewayFlag(req, res),
      axios.post(
        `${OPA_URL}/v1/data/nexusforge/allow`,
        { input },
        {
          timeout: 3000,
          headers: {
            "x-correlation-id": getCorrelationId(res)
          }
        }
      )
    ]);

    if (!routingEnabled) {
      res.status(503).json({ error: "Gateway routing disabled by feature flag" });
      return;
    }

    if (opaDecision.data.result !== true) {
      res.status(403).json({ error: "Denied by policy" });
      return;
    }

    next();
  } catch (error) {
    console.error("[gateway] policy check failed", error);
    res.status(500).json({ error: "Policy service unavailable" });
  }
};

const proxyRequest = (target: string, stripPrefix = "") => {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const contentType = req.header("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    const headers: Record<string, string> = {
      "x-correlation-id": getCorrelationId(res),
      "x-spiffe-id": process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/gateway"
    };

    const { traceId, spanId } = getTraceInfo(res);
    if (traceId) headers["x-trace-id"] = traceId;
    if (spanId) headers["x-span-id"] = spanId;

    const authHeader = req.header("authorization");
    if (authHeader) headers.authorization = authHeader;
    if (contentType) headers["content-type"] = contentType;
    const contentLength = req.header("content-length");
    if (contentLength) headers["content-length"] = contentLength;

    if (req.identity) {
      headers["x-user-id"] = req.identity.sub;
      headers["x-user-email"] = req.identity.email;
      headers["x-user-roles"] = req.identity.roles.join(",");
    }

    try {
      const response = await axios.request({
        url: `${target}${stripPrefix ? req.originalUrl.replace(new RegExp(`^${stripPrefix}`), "") || "/" : req.originalUrl}`,
        method: req.method as Method,
        params: req.query,
        headers,
        data: req.method === "GET" || req.method === "HEAD" ? undefined : isMultipart ? req : req.body,
        maxBodyLength: Infinity,
        validateStatus: () => true,
        timeout: 120000
      });

      res.status(response.status).json(response.data);
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error("[gateway] upstream request failed", axiosError.message);
      res.status(502).json({ error: "Upstream service unavailable" });
    }
  };
};

app.use(correlationMiddleware("gateway"));
app.use(verifyJwt);
app.use(enforcePolicy);

app.get("/health", (_req, res) => {
  res.json({
    service: "gateway",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.use("/auth", proxyRequest(serviceUrls.auth));
app.use("/projects", proxyRequest(serviceUrls.project));
app.use("/jobs", proxyRequest(serviceUrls.job));
app.use("/files", proxyRequest(serviceUrls.file));
app.use("/logs", proxyRequest(serviceUrls.job));
app.use("/mcp", proxyRequest(serviceUrls.mcp));
app.use("/incidents", proxyRequest(serviceUrls.incident));
app.use("/ai", proxyRequest(serviceUrls.ai, "/ai"));

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const start = async (): Promise<void> => {
  await initTelemetry("gateway");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "gateway",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/gateway"
    },
    { correlationId: "boot-gateway" }
  );

  app.listen(PORT, () => {
    console.log(`[gateway] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[gateway] startup failed", error);
  process.exit(1);
});

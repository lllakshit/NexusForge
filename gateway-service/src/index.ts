import axios, { AxiosError, Method } from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

dotenv.config();

type JwtIdentity = {
  sub: string | number;
  email: string;
  roles: string[];
};

type AuthenticatedRequest = Request & { identity?: JwtIdentity };

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

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET ?? "nexusforge-dev-jwt-secret-7f1e4a98d2c6b0a3";

const serviceUrls = {
  auth: process.env.AUTH_SERVICE_URL ?? "http://auth-service:4001",
  projects: process.env.PROJECT_SERVICE_URL ?? "http://project-service:4002",
  jobs: process.env.JOB_SERVICE_URL ?? "http://job-service:4003",
  files: process.env.STORAGE_SERVICE_URL ?? "http://storage-service:4004",
  logs: process.env.JOB_SERVICE_URL ?? "http://job-service:4003",
  mcp: process.env.MCP_SERVER_URL ?? "http://mcp-server:4005"
};

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const elapsed = Date.now() - startedAt;
    console.log(`[gateway] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsed}ms`);
  });
  next();
});

const isPublicRoute = (req: Request): boolean => {
  const originalPath = req.originalUrl.split("?")[0];

  if (req.method === "OPTIONS") {
    return true;
  }
  if (originalPath === "/health") {
    return true;
  }
  return req.method === "POST" && (originalPath === "/auth/login" || originalPath === "/auth/register");
};

const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (isPublicRoute(req)) {
    next();
    return;
  }

  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtIdentity;
    req.identity = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};

const buildForwardHeaders = (req: AuthenticatedRequest) => {
  const forwardedHeaders: Record<string, string> = {};

  const contentType = req.header("content-type");
  if (contentType) {
    forwardedHeaders["content-type"] = contentType;
  }

  const contentLength = req.header("content-length");
  if (contentLength) {
    forwardedHeaders["content-length"] = contentLength;
  }

  const authorization = req.header("authorization");
  if (authorization) {
    forwardedHeaders.authorization = authorization;
  }

  if (req.identity) {
    forwardedHeaders["x-user-id"] = String(req.identity.sub);
    forwardedHeaders["x-user-email"] = req.identity.email;
    forwardedHeaders["x-user-roles"] = req.identity.roles.join(",");
  }

  return forwardedHeaders;
};

const proxyTo = (target: string) => {
  return async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contentType = req.header("content-type") ?? "";
      const isMultipart = contentType.includes("multipart/form-data");

      const upstreamResponse = await axios.request({
        url: `${target}${req.originalUrl}`,
        method: req.method as Method,
        headers: buildForwardHeaders(req),
        params: req.query,
        data: req.method === "GET" || req.method === "HEAD" ? undefined : isMultipart ? req : req.body,
        maxBodyLength: Infinity,
        validateStatus: () => true,
        timeout: 15000
      });

      res.status(upstreamResponse.status).json(upstreamResponse.data);
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string }>;
      if (axiosError.response) {
        res.status(axiosError.response.status).json(axiosError.response.data);
        return;
      }
      res.status(502).json({ error: "Upstream service unavailable" });
    }
  };
};

app.get("/health", (_, res) => {
  res.json({
    service: "gateway-service",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.use("/auth", authenticate, proxyTo(serviceUrls.auth));
app.use("/projects", authenticate, proxyTo(serviceUrls.projects));
app.use("/jobs", authenticate, proxyTo(serviceUrls.jobs));
app.use("/files", authenticate, proxyTo(serviceUrls.files));
app.use("/logs", authenticate, proxyTo(serviceUrls.logs));
app.use("/mcp", authenticate, proxyTo(serviceUrls.mcp));

app.use((_, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`[gateway] listening on port ${PORT}`);
});

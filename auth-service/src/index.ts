import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, getCorrelationId, getTraceInfo, initTelemetry } from "@nexusforge/telemetry-sdk";
import { getDb } from "./db";

dotenv.config();

type UserRecord = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
};

const app = express();
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("auth-service"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4001);
const JWT_SECRET = process.env.JWT_SECRET ?? "nexusforge-dev-jwt-secret-2026";
const db = getDb();

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "auth-service"
});

app.get("/health", (_req, res) => {
  res.json({
    service: "auth-service",
    status: "ok",
    spiffe: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/auth-service",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
    if (!email || !password || !name) {
      res.status(400).json({ error: "email, password and name are required" });
      return;
    }

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = await db.query(
      "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id",
      [email, name, passwordHash]
    );
    const userId = String(insertResult.rows[0].id);

    const correlationId = getCorrelationId(res);
    const { traceId, spanId } = getTraceInfo(res);

    await eventBus.publish(
      "user.created",
      {
        userId,
        email,
        createdAt: new Date().toISOString()
      },
      { correlationId, traceId, spanId }
    );

    res.status(201).json({
      user: { id: userId, email, name }
    });
  } catch (error) {
    console.error("[auth-service] register error", error);
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const queryResult = await db.query<UserRecord>("SELECT id, email, name, password_hash FROM users WHERE email = $1", [email]);
    if (queryResult.rowCount === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = queryResult.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const rolesResult = await db.query<{ role: string }>(
      `
      SELECT role
      FROM memberships
      WHERE user_id = $1
      `,
      [user.id]
    );

    const roles = rolesResult.rowCount && rolesResult.rowCount > 0 ? rolesResult.rows.map((row) => row.role) : ["member"];
    const token = jwt.sign(
      {
        sub: String(user.id),
        email: user.email,
        roles
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: {
        id: String(user.id),
        email: user.email,
        name: user.name,
        roles
      }
    });
  } catch (error) {
    console.error("[auth-service] login error", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

app.get("/auth/verify", (req, res) => {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, payload });
  } catch {
    res.status(401).json({ valid: false });
  }
});

const start = async (): Promise<void> => {
  await initTelemetry("auth-service");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "auth-service",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/auth-service"
    },
    { correlationId: "boot-auth-service" }
  );

  app.listen(PORT, () => {
    console.log(`[auth-service] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[auth-service] startup failed", error);
  process.exit(1);
});

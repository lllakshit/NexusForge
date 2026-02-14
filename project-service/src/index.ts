import cors from "cors";
import dotenv from "dotenv";
import express, { Request } from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { EventBusClient } from "@nexusforge/event-sdk";
import { correlationMiddleware, getCorrelationId, getTraceInfo, initTelemetry } from "@nexusforge/telemetry-sdk";
import { getDb } from "./db";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(correlationMiddleware("project-service"));

collectDefaultMetrics();

const PORT = Number(process.env.PORT ?? 4002);
const db = getDb();

const eventBus = new EventBusClient({
  natsUrl: process.env.NATS_URL ?? "nats://nats:4222",
  streamName: process.env.NATS_STREAM ?? "NEXUSFORGE_EVENTS",
  sourceService: "project-service"
});

const getAuthContext = (req: Request) => {
  return {
    userId: req.header("x-user-id") ?? "",
    roles: (req.header("x-user-roles") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  };
};

app.get("/health", (_req, res) => {
  res.json({
    service: "project-service",
    status: "ok",
    spiffe: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/project-service",
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/projects", async (req, res) => {
  try {
    const { userId } = getAuthContext(req);
    if (!userId) {
      res.status(401).json({ error: "Missing user identity" });
      return;
    }

    const result = await db.query(
      `
      SELECT DISTINCT p.id, p.name, p.description, p.owner_id, p.created_at
      FROM projects p
      LEFT JOIN memberships m ON m.project_id = p.id
      WHERE p.owner_id = $1 OR m.user_id = $1
      ORDER BY p.created_at DESC
      `,
      [userId]
    );

    res.json({ projects: result.rows });
  } catch (error) {
    console.error("[project-service] list projects error", error);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

app.post("/projects", async (req, res) => {
  try {
    const { userId } = getAuthContext(req);
    if (!userId) {
      res.status(401).json({ error: "Missing user identity" });
      return;
    }

    const { name, description } = req.body as { name?: string; description?: string };
    if (!name) {
      res.status(400).json({ error: "Project name is required" });
      return;
    }

    const insertProject = await db.query(
      "INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING id, name, description, owner_id, created_at",
      [name, description ?? "", userId]
    );
    const project = insertProject.rows[0];

    await db.query(
      "INSERT INTO memberships (user_id, project_id, role) VALUES ($1, $2, $3) ON CONFLICT (user_id, project_id) DO UPDATE SET role = EXCLUDED.role",
      [userId, project.id, "owner"]
    );

    const correlationId = getCorrelationId(res);
    const { traceId, spanId } = getTraceInfo(res);
    await eventBus.publish(
      "project.created",
      {
        projectId: String(project.id),
        name: project.name,
        ownerId: String(project.owner_id),
        createdAt: new Date(project.created_at).toISOString()
      },
      { correlationId, traceId, spanId }
    );

    res.status(201).json({ project });
  } catch (error) {
    console.error("[project-service] create project error", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

app.post("/projects/:id/members", async (req, res) => {
  try {
    const { userId } = getAuthContext(req);
    if (!userId) {
      res.status(401).json({ error: "Missing user identity" });
      return;
    }

    const projectId = Number(req.params.id);
    const { memberId, role } = req.body as { memberId?: string; role?: string };

    if (!projectId || !memberId) {
      res.status(400).json({ error: "project id and memberId are required" });
      return;
    }

    const projectResult = await db.query("SELECT owner_id FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rowCount === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const ownerId = String(projectResult.rows[0].owner_id);
    if (ownerId !== userId) {
      res.status(403).json({ error: "Only owner can add members" });
      return;
    }

    await db.query(
      "INSERT INTO memberships (user_id, project_id, role) VALUES ($1, $2, $3) ON CONFLICT (user_id, project_id) DO UPDATE SET role = EXCLUDED.role",
      [memberId, projectId, role ?? "member"]
    );

    res.status(201).json({
      membership: {
        userId: memberId,
        projectId: String(projectId),
        role: role ?? "member"
      }
    });
  } catch (error) {
    console.error("[project-service] add member error", error);
    res.status(500).json({ error: "Failed to add member" });
  }
});

app.delete("/projects/:id", async (req, res) => {
  try {
    const { userId, roles } = getAuthContext(req);
    if (!userId) {
      res.status(401).json({ error: "Missing user identity" });
      return;
    }

    const projectId = Number(req.params.id);
    const projectResult = await db.query("SELECT owner_id FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rowCount === 0) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const ownerId = String(projectResult.rows[0].owner_id);
    if (ownerId !== userId && !roles.includes("admin")) {
      res.status(403).json({ error: "Not authorized to delete project" });
      return;
    }

    await db.query("DELETE FROM projects WHERE id = $1", [projectId]);

    const correlationId = getCorrelationId(res);
    const { traceId, spanId } = getTraceInfo(res);
    await eventBus.publish(
      "project.deleted",
      {
        projectId: String(projectId),
        deletedBy: userId,
        deletedAt: new Date().toISOString()
      },
      { correlationId, traceId, spanId }
    );

    res.json({ deleted: true, projectId: String(projectId) });
  } catch (error) {
    console.error("[project-service] delete project error", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

const start = async (): Promise<void> => {
  await initTelemetry("project-service");
  await eventBus.connect();
  await eventBus.publish(
    "service.registered",
    {
      service: "project-service",
      spiffeId: process.env.SERVICE_SPIFFE_ID ?? "spiffe://nexusforge.local/project-service"
    },
    { correlationId: "boot-project-service" }
  );

  app.listen(PORT, () => {
    console.log(`[project-service] listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("[project-service] startup failed", error);
  process.exit(1);
});

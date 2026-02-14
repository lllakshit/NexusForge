import axios from "axios";
import { EventBusClient } from "@nexusforge/event-sdk";

const JOB_SERVICE_URL = process.env.JOB_SERVICE_URL ?? "http://job-service:4003";
const WORKER_PYTHON_URL = process.env.WORKER_PYTHON_URL ?? "http://worker-python:5000";
const NATS_URL = process.env.NATS_URL ?? "nats://nats:4222";

let eventBus: EventBusClient | undefined;

const getEventBus = async (): Promise<EventBusClient> => {
  if (!eventBus) {
    eventBus = new EventBusClient({ natsUrl: NATS_URL, sourceService: "temporal-worker" });
    await eventBus.connect();
  }
  return eventBus;
};

export const markJobRunning = async (jobId: string): Promise<void> => {
  await axios.post(`${JOB_SERVICE_URL}/internal/jobs/${jobId}/status`, { status: "running" });
};

export const runPythonTask = async (jobId: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const response = await axios.post(`${WORKER_PYTHON_URL}/task/run`, { jobId, payload }, { timeout: 20000 });
  return response.data as Record<string, unknown>;
};

export const markJobCompleted = async (jobId: string, output: Record<string, unknown>): Promise<void> => {
  await axios.post(`${JOB_SERVICE_URL}/internal/jobs/${jobId}/complete`, { output, status: "completed" });
  const bus = await getEventBus();
  await bus.publish(
    "job.completed",
    {
      jobId,
      status: "completed",
      completedAt: new Date().toISOString()
    },
    { correlationId: `wf-${jobId}` }
  );
};

export const compensateJob = async (jobId: string, reason: string): Promise<void> => {
  await axios.post(`${JOB_SERVICE_URL}/internal/jobs/${jobId}/status`, { status: "failed", reason });
  const bus = await getEventBus();
  await bus.publish(
    "job.completed",
    {
      jobId,
      status: "failed",
      completedAt: new Date().toISOString()
    },
    { correlationId: `wf-${jobId}` }
  );
};

export const notifyApprovalTimeout = async (requestId: string): Promise<void> => {
  await axios.post(`${JOB_SERVICE_URL}/internal/approvals/${requestId}/timeout`);
};

export const markApprovalResult = async (requestId: string, approved: boolean): Promise<void> => {
  await axios.post(`${JOB_SERVICE_URL}/internal/approvals/${requestId}/decision`, { approved });
};

export const retryJob = async (jobId: string): Promise<void> => {
  await axios.post(`${JOB_SERVICE_URL}/internal/jobs/${jobId}/retry`);
};

export const recordRemediation = async (jobId: string, action: string): Promise<void> => {
  const bus = await getEventBus();
  await bus.publish(
    "incident.remediated",
    {
      jobId,
      action,
      time: new Date().toISOString()
    },
    { correlationId: `incident-${jobId}` }
  );
};

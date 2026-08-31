import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000",
  timeout: 120000
});

const aiClient = axios.create({
  baseURL: import.meta.env.VITE_AI_CORE_URL ?? "http://localhost:4011",
  timeout: 120000
});

function attachToken(config: any) {
  const token = localStorage.getItem("nexusforge_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}

client.interceptors.request.use(attachToken);
aiClient.interceptors.request.use(attachToken);

function asError(error: unknown) {
  const maybe = error as {
    response?: { data?: { detail?: string | Array<{ msg?: string }>; error?: string } };
    message?: string;
  };
  const detail = maybe.response?.data?.detail ?? maybe.response?.data?.error;
  if (Array.isArray(detail)) {
    return new Error(detail.map((item) => item.msg).filter(Boolean).join(". ") || "Invalid input");
  }
  if (detail) {
    return new Error(String(detail));
  }
  return error instanceof Error ? error : new Error("Request failed");
}

export const api = {
  register: (payload: { email: string; password: string; name: string }) =>
    aiClient.post("/auth/register", payload).catch((error) => {
      throw asError(error);
    }),
  login: (payload: { email: string; password: string }) =>
    aiClient.post("/auth/login", payload).catch((error) => {
      throw asError(error);
    }),
  me: () =>
    aiClient.get("/auth/me").catch((error) => {
      throw asError(error);
    }),
  health: () => aiClient.get("/health"),
  listProjects: () => client.get("/projects"),
  createProject: (payload: { name: string; description: string }) => client.post("/projects", payload),
  listJobs: () => client.get("/jobs"),
  createJob: (payload: { name: string; projectId: string; payload: Record<string, unknown> }) =>
    client.post("/jobs", payload),
  getJobTimeline: (jobId: string) => client.get(`/jobs/${jobId}/timeline`),
  listLogs: () => client.get("/logs"),
  listFiles: () => client.get("/files"),
  uploadFile: (formData: FormData) => client.post("/files/upload", formData),
  listIncidents: () => client.get("/incidents"),
  mcpResources: () => client.get("/mcp/resources"),
  mcpTools: () => client.get("/mcp/tools"),
  mcpPrompts: () => client.get("/mcp/prompts"),
  chat: (payload: { prompt: string; system_prompt?: string }) =>
    aiClient.post("/chat", payload).catch((error) => {
      throw asError(error);
    }),
  routeTask: (payload: { task: string }) => aiClient.post("/route", { task: payload.task }),
  executeTask: (payload: { task: string }) => aiClient.post("/execute", { task: payload.task })
};

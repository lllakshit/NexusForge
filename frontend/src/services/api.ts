import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000",
  timeout: 15000
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("nexusforge_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  register: (payload: { email: string; password: string; name: string }) => client.post("/auth/register", payload),
  login: (payload: { email: string; password: string }) => client.post("/auth/login", payload),
  verify: () => client.get("/auth/verify"),
  listProjects: () => client.get("/projects"),
  createProject: (payload: { name: string; description: string }) => client.post("/projects", payload),
  listJobs: () => client.get("/jobs"),
  createJob: (payload: { name: string; projectId: string; payload: Record<string, unknown> }) => client.post("/jobs", payload),
  getJobTimeline: (jobId: string) => client.get(`/jobs/${jobId}/timeline`),
  listLogs: () => client.get("/logs"),
  listFiles: () => client.get("/files"),
  uploadFile: (formData: FormData) => client.post("/files/upload", formData),
  listIncidents: () => client.get("/incidents"),
  mcpResources: () => client.get("/mcp/resources"),
  mcpTools: () => client.get("/mcp/tools"),
  mcpPrompts: () => client.get("/mcp/prompts")
};

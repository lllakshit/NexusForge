import { FormEvent, useEffect, useState } from "react";
import { api } from "@/services/api";

type Job = {
  id: string;
  name: string;
  projectId: string;
  status: string;
  createdAt: string;
};

export function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [payloadText, setPayloadText] = useState('{"values":[1,2,3,4]}');
  const [status, setStatus] = useState("");

  const loadJobs = async () => {
    try {
      const response = await api.listJobs();
      setJobs(response.data.jobs ?? []);
    } catch (error) {
      setStatus(`Failed to load jobs: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      await api.createJob({ name, projectId, payload });
      setStatus("Job queued via Temporal workflow.");
      await loadJobs();
    } catch (error) {
      setStatus(`Job creation failed: ${(error as Error).message}`);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Jobs</h2>
      <form onSubmit={onCreate} className="space-y-2 rounded-xl border border-slate-200 p-4">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Job name"
          required
        />
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          placeholder="Project ID"
          required
        />
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          rows={6}
          value={payloadText}
          onChange={(event) => setPayloadText(event.target.value)}
        />
        <button type="submit" className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
          Create Job
        </button>
      </form>

      {status && <p className="text-sm text-slate-600">{status}</p>}

      <div className="space-y-2">
        {jobs.map((job) => (
          <article key={job.id} className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold">{job.name}</p>
            <p className="text-xs text-slate-500">Project: {job.projectId}</p>
            <p className="text-xs text-slate-500">Status: {job.status}</p>
            <p className="text-xs text-slate-500">{new Date(job.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

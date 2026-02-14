import { useEffect, useState } from "react";
import { api } from "@/services/api";

export function Dashboard() {
  const [projectsCount, setProjectsCount] = useState(0);
  const [jobsCount, setJobsCount] = useState(0);
  const [logsCount, setLogsCount] = useState(0);
  const [incidentsCount, setIncidentsCount] = useState(0);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [projects, jobs, logs, incidents] = await Promise.all([
          api.listProjects(),
          api.listJobs(),
          api.listLogs(),
          api.listIncidents()
        ]);
        setProjectsCount((projects.data.projects ?? []).length);
        setJobsCount((jobs.data.jobs ?? []).length);
        setLogsCount((logs.data.logs ?? []).length);
        setIncidentsCount((incidents.data.incidents ?? []).length);
      } catch (error) {
        setStatus(`Failed to load dashboard metrics: ${(error as Error).message}`);
      }
    };

    void load();
  }, []);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="text-sm text-slate-600">Realtime platform health and control snapshot.</p>
      </header>

      {status && <p className="text-sm text-rose-500">{status}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase text-slate-500">Projects</p>
          <p className="text-2xl font-bold">{projectsCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase text-slate-500">Jobs</p>
          <p className="text-2xl font-bold">{jobsCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase text-slate-500">Logs</p>
          <p className="text-2xl font-bold">{logsCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 p-4">
          <p className="text-xs uppercase text-slate-500">Incidents</p>
          <p className="text-2xl font-bold">{incidentsCount}</p>
        </article>
      </div>
    </section>
  );
}

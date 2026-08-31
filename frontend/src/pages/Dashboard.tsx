import { useEffect, useState } from "react";
import { api } from "@/services/api";

type UsageEvent = {
  time?: string;
  source?: string;
  model?: string;
  status?: string;
  message?: string;
  latency_ms?: number;
};

type Health = {
  status?: string;
  cloud_provider?: string;
  cloud_model?: string;
  cloud_configured?: boolean;
  route_mode?: string;
  queue_size?: number;
  usage?: {
    requests?: number;
    tokens?: number;
    errors?: number;
    avg_latency_ms?: number | null;
    error_rate?: number;
    events?: UsageEvent[];
  };
};

export function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () => {
      void api
        .health()
        .then((response) => setHealth(response.data))
        .catch((errorValue) => setError((errorValue as Error).message));
    };
    load();
    const timer = window.setInterval(load, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const usage = health?.usage;
  const kpis = [
    { label: "Total Requests", value: String(usage?.requests ?? 0) },
    { label: "Total Tokens", value: String(usage?.tokens ?? 0) },
    { label: "Avg Latency", value: usage?.avg_latency_ms != null ? `${usage.avg_latency_ms} ms` : "—" },
    { label: "Error Rate", value: `${usage?.error_rate ?? 0}%` }
  ];

  const services = [
    { name: "AI Core", state: health?.status === "ok" ? "Healthy" : "Unknown" },
    { name: "Gemini", state: health?.cloud_configured ? "Healthy" : "Not configured" }
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
          <p className="text-sm text-nf-muted">Live data only. Nothing is seeded.</p>
        </div>
        <span className="rounded-full bg-nf-panel2 px-3 py-1 text-xs text-nf-muted">Live</span>
      </div>

      {error && <p className="text-sm text-nf-red">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rounded-xl border border-nf-line bg-nf-panel p-4">
            <p className="text-xs uppercase tracking-wide text-nf-muted">{kpi.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{kpi.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <article className="rounded-xl border border-nf-line bg-nf-panel p-4">
          <h3 className="text-sm font-medium text-white">Recent activity</h3>
          {(usage?.events ?? []).length === 0 ? (
            <p className="mt-8 text-sm text-nf-muted">No inference traffic yet. Use Playground after you log in.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {(usage?.events ?? []).map((event, index) => (
                <div key={`${event.time}-${index}`} className="rounded-lg bg-nf-bg px-3 py-2 text-sm">
                  <p className="text-white">
                    {event.source} · {event.status}
                    {event.model ? ` · ${event.model}` : ""}
                  </p>
                  <p className="text-xs text-nf-muted">
                    {event.latency_ms != null ? `${event.latency_ms} ms` : event.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="rounded-xl border border-nf-line bg-nf-panel p-4">
          <h3 className="text-sm font-medium text-white">System health</h3>
          <div className="mt-3 space-y-2">
            {services.map((service) => (
              <div key={service.name} className="flex items-center justify-between rounded-lg bg-nf-bg px-3 py-2 text-sm">
                <span>{service.name}</span>
                <span className={service.state === "Healthy" ? "text-nf-green" : "text-nf-amber"}>{service.state}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-xl border border-nf-line bg-nf-panel p-4">
          <h3 className="text-sm font-medium text-white">Active models</h3>
          {health?.cloud_configured ? (
            <>
              <p className="mt-3 text-sm text-white">{health.cloud_model}</p>
              <p className="text-xs text-nf-muted">{health.cloud_provider} · cloud</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-nf-muted">No cloud model configured yet.</p>
          )}
        </article>
        <article className="rounded-xl border border-nf-line bg-nf-panel p-4">
          <h3 className="text-sm font-medium text-white">Route mode</h3>
          <p className="mt-3 text-2xl font-semibold text-white">{health?.route_mode ?? "—"}</p>
        </article>
        <article className="rounded-xl border border-nf-line bg-nf-panel p-4">
          <h3 className="text-sm font-medium text-white">Queue</h3>
          <p className="mt-3 text-2xl font-semibold text-white">{health?.queue_size ?? 0}</p>
        </article>
      </div>
    </section>
  );
}

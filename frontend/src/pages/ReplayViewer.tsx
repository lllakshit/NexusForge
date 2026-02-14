import { useState } from "react";
import { api } from "@/services/api";

type TimelineEvent = {
  level: string;
  message: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export function ReplayViewer() {
  const [jobId, setJobId] = useState("");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [status, setStatus] = useState("");

  const loadTimeline = async () => {
    setStatus("");
    setTimeline([]);
    try {
      const response = await api.getJobTimeline(jobId);
      setTimeline(response.data.timeline ?? []);
    } catch (error) {
      setStatus(`Failed to load replay timeline: ${(error as Error).message}`);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Replay Viewer</h2>
      <div className="flex gap-2">
        <input
          value={jobId}
          onChange={(event) => setJobId(event.target.value)}
          placeholder="Job ID"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <button type="button" onClick={() => void loadTimeline()} className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white">
          Replay
        </button>
      </div>

      {status && <p className="text-sm text-rose-500">{status}</p>}

      <div className="space-y-2">
        {timeline.map((event, index) => (
          <article key={`${event.createdAt}-${index}`} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase text-slate-500">{event.level}</p>
            <p className="font-medium">{event.message}</p>
            <p className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

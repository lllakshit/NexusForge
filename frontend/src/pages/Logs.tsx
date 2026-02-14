import { useEffect, useState } from "react";
import { api } from "@/services/api";

type LogRecord = {
  id: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export function Logs() {
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [status, setStatus] = useState("");

  const loadLogs = async () => {
    try {
      const response = await api.listLogs();
      setLogs(response.data.logs ?? []);
    } catch (error) {
      setStatus(`Failed to load logs: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Logs</h2>
        <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => void loadLogs()}>
          Refresh
        </button>
      </div>
      {status && <p className="text-sm text-rose-500">{status}</p>}

      <div className="space-y-2">
        {logs.map((log) => (
          <article key={log.id} className="rounded-lg border border-slate-200 p-3">
            <p className={`text-sm font-semibold ${log.level === "error" ? "text-rose-500" : "text-teal-500"}`}>{log.level.toUpperCase()}</p>
            <p className="text-sm">{log.message}</p>
            <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

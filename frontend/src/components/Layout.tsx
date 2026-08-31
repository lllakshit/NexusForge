import { PropsWithChildren } from "react";
import { PageId, useAppStore } from "@/store/useAppStore";

const pages: Array<{ id: PageId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "models", label: "Models" },
  { id: "playground", label: "Playground" },
  { id: "applications", label: "Applications" },
  { id: "agents", label: "Agents" },
  { id: "projects", label: "Projects" },
  { id: "jobs", label: "Jobs" },
  { id: "logs", label: "Logs & Traces" },
  { id: "memory", label: "Memory" },
  { id: "mcp", label: "MCP Registry" },
  { id: "incidents", label: "Incidents" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "monitoring", label: "Monitoring" },
  { id: "settings", label: "Settings" }
];

export function Layout({ children }: PropsWithChildren) {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);
  const user = useAppStore((state) => state.user);
  const clearSession = useAppStore((state) => state.clearSession);

  return (
    <div className="min-h-screen bg-nf-bg text-nf-text">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-nf-line bg-nf-panel px-4 py-5">
          <p className="text-lg font-semibold tracking-wide text-white">NEXUSFORGE</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-nf-muted">AI Control Plane</p>
          <nav className="mt-6 space-y-1">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setCurrentPage(page.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  currentPage === page.id
                    ? "bg-gradient-to-r from-nf-accent to-nf-accent2 text-white shadow-glow"
                    : "text-nf-muted hover:bg-nf-panel2 hover:text-white"
                }`}
              >
                {page.label}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-xl border border-nf-line bg-nf-bg p-3">
            <p className="text-xs text-nf-muted">Workspace</p>
            <p className="mt-1 text-sm text-white">Default Workspace</p>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{user?.name ?? "Signed in"}</p>
                <p className="text-xs text-nf-muted">{user?.email}</p>
              </div>
              <button type="button" onClick={clearSession} className="text-xs text-nf-muted hover:text-white">
                Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between border-b border-nf-line px-6 py-4">
            <input
              className="w-full max-w-xl rounded-lg border border-nf-line bg-nf-panel px-4 py-2 text-sm text-white outline-none"
              placeholder="Search projects, jobs, models, logs..."
            />
            <div className="ml-4 hidden items-center gap-3 md:flex">
              <div className="text-right">
                <p className="text-sm text-white">{user?.name}</p>
                <p className="text-xs text-nf-muted">{user?.email}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nf-accent text-xs font-semibold">
                {(user?.name ?? "U").slice(0, 2).toUpperCase()}
              </div>
            </div>
          </header>
          <main className="flex-1 p-6">{children}</main>
          <footer className="flex items-center justify-between border-t border-nf-line px-6 py-3 text-xs text-nf-muted">
            <span>NexusForge v0.2.0</span>
            <span>Local control plane</span>
            <span>Docs · Support · API</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

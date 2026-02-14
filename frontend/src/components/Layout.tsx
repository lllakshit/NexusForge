import { PropsWithChildren } from "react";
import { PageId, useAppStore } from "@/store/useAppStore";

const pages: Array<{ id: PageId; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "projects", label: "Projects" },
  { id: "jobs", label: "Jobs" },
  { id: "logs", label: "Logs" },
  { id: "topology", label: "Topology Viewer" },
  { id: "replay", label: "Replay Viewer" }
];

export function Layout({ children }: PropsWithChildren) {
  const currentPage = useAppStore((state) => state.currentPage);
  const setCurrentPage = useAppStore((state) => state.setCurrentPage);

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 md:grid-cols-[250px_1fr]">
        <aside className="rounded-2xl bg-ink-900 p-4 text-white shadow-xl">
          <h1 className="text-2xl font-bold">NexusForge</h1>
          <p className="text-xs text-slate-300">Self-Driving Developer Platform</p>
          <div className="mt-6 space-y-2">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={() => setCurrentPage(page.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  currentPage === page.id ? "bg-teal-500 text-white" : "bg-ink-700 hover:bg-ink-700/80"
                }`}
              >
                {page.label}
              </button>
            ))}
          </div>
        </aside>
        <main className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">{children}</main>
      </div>
    </div>
  );
}

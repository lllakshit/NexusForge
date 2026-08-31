import { useEffect, useMemo } from "react";
import { Layout } from "@/components/Layout";
import { AuthScreen } from "@/pages/AuthScreen";
import { Dashboard } from "@/pages/Dashboard";
import { Playground } from "@/pages/Playground";
import { Projects } from "@/pages/Projects";
import { Jobs } from "@/pages/Jobs";
import { Logs } from "@/pages/Logs";
import { PlaceholderPage } from "@/pages/PlaceholderPage";
import { TopologyViewer } from "@/pages/TopologyViewer";
import { ReplayViewer } from "@/pages/ReplayViewer";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";

export function App() {
  const page = useAppStore((state) => state.currentPage);
  const token = useAppStore((state) => state.token);
  const user = useAppStore((state) => state.user);
  const setSession = useAppStore((state) => state.setSession);
  const clearSession = useAppStore((state) => state.clearSession);

  useEffect(() => {
    if (!token) return;
    void api
      .me()
      .then((response) => setSession(token, response.data.user))
      .catch(() => clearSession());
  }, [token, setSession, clearSession]);

  const content = useMemo(() => {
    switch (page) {
      case "playground":
        return <Playground />;
      case "projects":
        return <Projects />;
      case "jobs":
        return <Jobs />;
      case "logs":
        return <Logs />;
      case "infrastructure":
        return <TopologyViewer />;
      case "monitoring":
        return <ReplayViewer />;
      case "models":
        return <PlaceholderPage title="Models" note="Register Gemini, OmniRoute, or later Ollama endpoints here." />;
      case "applications":
        return <PlaceholderPage title="Applications" note="Deployed AI apps will appear here." />;
      case "agents":
        return <PlaceholderPage title="Agents" note="Planner, coder, research, and critic agents will be listed here." />;
      case "memory":
        return <PlaceholderPage title="Memory" note="Conversation and project memory will be inspected here." />;
      case "mcp":
        return <PlaceholderPage title="MCP Registry" note="Tools, resources, and prompts will be managed here." />;
      case "incidents":
        return <PlaceholderPage title="Incidents" note="Incident automation will surface here once the job plane is running." />;
      case "settings":
        return <PlaceholderPage title="Settings" note="Workspace, keys, and routing policy will live here." />;
      case "dashboard":
      default:
        return <Dashboard />;
    }
  }, [page]);

  if (!token || !user) {
    return <AuthScreen />;
  }

  return <Layout>{content}</Layout>;
}

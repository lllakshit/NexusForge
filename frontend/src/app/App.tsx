import { FormEvent, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Projects } from "@/pages/Projects";
import { Jobs } from "@/pages/Jobs";
import { Logs } from "@/pages/Logs";
import { TopologyViewer } from "@/pages/TopologyViewer";
import { ReplayViewer } from "@/pages/ReplayViewer";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";

export function App() {
  const page = useAppStore((state) => state.currentPage);
  const setToken = useAppStore((state) => state.setToken);

  const [email, setEmail] = useState("admin@nexusforge.local");
  const [password, setPassword] = useState("pass1234");
  const [name, setName] = useState("Platform Admin");
  const [status, setStatus] = useState("");

  const content = useMemo(() => {
    switch (page) {
      case "projects":
        return <Projects />;
      case "jobs":
        return <Jobs />;
      case "logs":
        return <Logs />;
      case "topology":
        return <TopologyViewer />;
      case "replay":
        return <ReplayViewer />;
      case "dashboard":
      default:
        return <Dashboard />;
    }
  }, [page]);

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    try {
      await api.register({ email, password, name });
      setStatus("User registered.");
    } catch (error) {
      setStatus(`Register failed: ${(error as Error).message}`);
    }
  };

  const login = async () => {
    setStatus("");
    try {
      const response = await api.login({ email, password });
      const token = String(response.data.token ?? "");
      localStorage.setItem("nexusforge_token", token);
      setToken(token);
      setStatus("Login successful.");
    } catch (error) {
      setStatus(`Login failed: ${(error as Error).message}`);
    }
  };

  return (
    <Layout>
      <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-lg font-semibold">Access Control</h2>
        <form onSubmit={register} className="mt-3 grid gap-2 md:grid-cols-4">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={password}
            type="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
              Register
            </button>
            <button type="button" onClick={() => void login()} className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white">
              Login
            </button>
          </div>
        </form>
        {status && <p className="mt-2 text-sm text-slate-600">{status}</p>}
      </section>
      {content}
    </Layout>
  );
}

import { FormEvent, useState } from "react";
import { api } from "@/services/api";
import { useAppStore } from "@/store/useAppStore";

export function AuthScreen() {
  const setSession = useAppStore((state) => state.setSession);
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      if (mode === "register") {
        const response = await api.register({ name, email, password });
        setSession(String(response.data.token), response.data.user);
      } else {
        const response = await api.login({ email, password });
        setSession(String(response.data.token), response.data.user);
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-nf-bg px-4">
      <div className="w-full max-w-md rounded-2xl border border-nf-line bg-nf-panel p-8">
        <p className="text-xs tracking-[0.24em] text-nf-muted">NEXUSFORGE</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">AI Control Plane</h1>
        <p className="mt-2 text-sm text-nf-muted">
          Create your account, then sign in. No demo user is seeded.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-nf-bg p-1">
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-lg px-3 py-2 text-sm ${mode === "register" ? "bg-nf-accent text-white" : "text-nf-muted"}`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-lg px-3 py-2 text-sm ${mode === "login" ? "bg-nf-accent text-white" : "text-nf-muted"}`}
          >
            Login
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3" autoComplete="off">
          {mode === "register" && (
            <input
              className="w-full rounded-lg border border-nf-line bg-nf-bg px-3 py-3 text-sm text-white outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
              required
            />
          )}
          <input
            className="w-full rounded-lg border border-nf-line bg-nf-bg px-3 py-3 text-sm text-white outline-none"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
            required
          />
          <input
            className="w-full rounded-lg border border-nf-line bg-nf-bg px-3 py-3 text-sm text-white outline-none"
            value={password}
            type="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "register" ? "Password, 8+ characters" : "Password"}
            required
            minLength={8}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gradient-to-r from-nf-accent to-nf-accent2 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}
          </button>
        </form>
        {status && <p className="mt-3 text-sm text-nf-red">{status}</p>}
      </div>
    </div>
  );
}

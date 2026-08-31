import { FormEvent, useState } from "react";
import { api } from "@/services/api";

type ChatResult = {
  ok?: boolean;
  provider?: string;
  model?: string;
  route?: string;
  output?: string;
};

export function Playground() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [meta, setMeta] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    setOutput("");
    try {
      const response = await api.chat({ prompt });
      const payload = response.data as ChatResult;
      setOutput(payload.output ?? "");
      setMeta(`${payload.provider ?? "cloud"} / ${payload.model ?? "unknown"} · ${payload.route ?? "cloud"}`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-white">Playground</h2>
        <p className="text-sm text-nf-muted">Chat through NexusForge AI Core. Cloud Gemini path, no Ollama required.</p>
      </header>
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-nf-line bg-nf-panel p-4">
        <textarea
          className="w-full rounded-lg border border-nf-line bg-nf-bg px-3 py-3 text-sm text-white outline-none"
          rows={6}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask the connected cloud model"
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-nf-accent to-nf-accent2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Running..." : "Send"}
        </button>
      </form>
      {status && <p className="text-sm text-nf-red">{status}</p>}
      {meta && <p className="text-xs uppercase tracking-wide text-nf-muted">{meta}</p>}
      {output && (
        <article className="whitespace-pre-wrap rounded-xl border border-nf-line bg-nf-panel p-4 text-sm leading-6 text-nf-text">
          {output}
        </article>
      )}
    </section>
  );
}

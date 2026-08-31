import { FormEvent, useEffect, useState } from "react";
import { api } from "@/services/api";

type Project = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
};

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");

  const loadProjects = async () => {
    try {
      const response = await api.listProjects();
      setProjects(response.data.projects ?? []);
    } catch (error) {
      setStatus(`Failed to load projects: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    try {
      await api.createProject({ name, description });
      setName("");
      setDescription("");
      setStatus("Project created.");
      await loadProjects();
    } catch (error) {
      setStatus(`Project creation failed: ${(error as Error).message}`);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-white">Projects</h2>
      <form onSubmit={onCreate} className="space-y-2 rounded-xl border border-nf-line bg-nf-panel p-4">
        <input
          className="w-full rounded-lg border border-nf-line bg-nf-bg px-3 py-2 text-white"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          required
        />
        <textarea
          className="w-full rounded-lg border border-nf-line bg-nf-bg px-3 py-2 text-white"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Project description"
          rows={4}
        />
        <button type="submit" className="rounded-lg bg-nf-accent px-4 py-2 text-sm font-semibold text-white">
          Create Project
        </button>
      </form>

      {status && <p className="text-sm text-nf-muted">{status}</p>}

      <div className="space-y-2">
        {projects.map((project) => (
          <article key={project.id} className="rounded-lg border border-nf-line bg-nf-panel p-3">
            <h3 className="font-semibold text-white">{project.name}</h3>
            <p className="text-sm text-nf-muted">{project.description}</p>
            <p className="text-xs text-nf-muted">Owner: {project.owner_id}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

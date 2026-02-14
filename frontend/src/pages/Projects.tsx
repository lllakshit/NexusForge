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
      <h2 className="text-2xl font-semibold">Projects</h2>
      <form onSubmit={onCreate} className="space-y-2 rounded-xl border border-slate-200 p-4">
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Project name"
          required
        />
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Project description"
          rows={4}
        />
        <button type="submit" className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white">
          Create Project
        </button>
      </form>

      {status && <p className="text-sm text-slate-600">{status}</p>}

      <div className="space-y-2">
        {projects.map((project) => (
          <article key={project.id} className="rounded-lg border border-slate-200 p-3">
            <h3 className="font-semibold">{project.name}</h3>
            <p className="text-sm text-slate-600">{project.description}</p>
            <p className="text-xs text-slate-500">Owner: {project.owner_id}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

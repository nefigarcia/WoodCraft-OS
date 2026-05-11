"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

interface Client { id: string; name: string; email: string | null }
interface Project { id: string; name: string; status: string; client: Client | null; _count: { rooms: number; quotes: number }; updatedAt: string }

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export function NewProjectModal({ onClose, onCreated }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .get<{ data: Client[] }>("/clients?pageSize=100")
      .then((r) => {
        setClients(r.data);
        if (r.data[0]) setClientId(r.data[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Select a client"); return; }
    if (!name.trim()) { setError("Project name is required"); return; }

    setLoading(true);
    setError("");
    try {
      const project = await apiClient.post<Project>("/projects", { clientId, name: name.trim(), description });

      // Auto-create a default room so the editor has somewhere to put cabinets
      await apiClient.post(`/projects/${project.id}/rooms`, {
        name: "Main Room",
        width: 4800,
        height: 2400,
        depth: 5400,
      }).catch(() => {});

      onCreated(project);
      router.push(`/projects/${project.id}/editor`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 w-96 shadow-xl">
        <h2 className="text-white font-semibold text-lg mb-5">New Project</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Client</label>
            {clients.length === 0 ? (
              <p className="text-xs text-yellow-500">
                No clients yet.{" "}
                <a href="/clients" className="underline">Add one first</a>.
              </p>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Project name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kitchen Remodel — Johnson"
              className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm text-gray-400 hover:text-white py-2 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || clients.length === 0}
              className="flex-1 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2 rounded-md transition-colors"
            >
              {loading ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { NewProjectModal } from "@/components/projects/NewProjectModal";

interface ProjectSummary {
  id: string;
  name: string;
  status: string;
  client: { id: string; name: string } | null;
  _count: { rooms: number; quotes: number };
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-gray-400",
  in_review: "text-yellow-400",
  approved: "text-green-400",
  in_production: "text-brand-400",
  complete: "text-blue-400",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get<{ data: ProjectSummary[] }>("/projects");
      setProjects(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Projects</h1>
          <p className="text-gray-400 text-sm">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Project
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No projects yet.</p>
          <p className="text-gray-600 text-xs mt-1">Create your first project to start designing.</p>
          <button
            onClick={() => setShowNew(true)}
            className="mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-surface-50 border border-surface-200 hover:border-surface-300 rounded-xl p-5 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{p.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5 truncate">{p.client?.name ?? "No client"}</p>
                </div>
                <span className={`text-xs capitalize ml-2 ${STATUS_COLORS[p.status] ?? "text-gray-400"}`}>
                  {p.status.replace(/_/g, " ")}
                </span>
              </div>

              <div className="flex text-xs text-gray-600 gap-3 mb-4">
                <span>{p._count?.rooms ?? 0} room{(p._count?.rooms ?? 0) !== 1 ? "s" : ""}</span>
                <span>{p._count?.quotes ?? 0} quote{(p._count?.quotes ?? 0) !== 1 ? "s" : ""}</span>
                <span>Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
              </div>

              <Link
                href={`/projects/${p.id}`}
                className="block w-full text-center text-sm bg-surface-100 hover:bg-surface-200 text-gray-300 py-1.5 rounded-md transition-colors"
              >
                Open project →
              </Link>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={(project) => {
            setProjects((prev) => [project as ProjectSummary, ...prev]);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
}

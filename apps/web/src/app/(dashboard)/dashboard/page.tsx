"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface DashboardStats {
  activeProjects: number;
  openQuotes: number;
  pendingFeedback: number;
  cncJobsThisMonth: number;
}

interface RecentProject {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  client: { id: string; name: string } | null;
  _count: { rooms: number };
}

interface RecentFeedback {
  id: string;
  projectId: string;
  reportedBy: string;
  severity: "info" | "warning" | "error";
  category: string;
  description: string;
  createdAt: string;
}

interface DashboardData {
  stats: DashboardStats;
  recentProjects: RecentProject[];
  recentFeedback: RecentFeedback[];
}

const STATUS_DOT: Record<string, string> = {
  draft: "bg-gray-500",
  in_review: "bg-yellow-400",
  approved: "bg-green-400",
  in_production: "bg-brand-400",
  complete: "bg-blue-400",
};

const SEV_COLOR: Record<string, string> = {
  info: "text-blue-400 bg-blue-900/20",
  warning: "text-yellow-400 bg-yellow-900/20",
  error: "text-red-400 bg-red-900/20",
};

function StatCard({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <div className="bg-surface-50 border border-surface-200 rounded-xl p-5 hover:border-surface-300 transition-colors">
      <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<DashboardData>("/dashboard")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-gray-400 text-sm mb-8">Overview of your shop's activity.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Projects" value={loading ? "—" : (stats?.activeProjects ?? 0)} href="/projects" />
        <StatCard label="Open Quotes" value={loading ? "—" : (stats?.openQuotes ?? 0)} />
        <StatCard label="CNC Jobs This Month" value={loading ? "—" : (stats?.cncJobsThisMonth ?? 0)} />
        <StatCard
          label="Pending Feedback"
          value={loading ? "—" : (stats?.pendingFeedback ?? 0)}
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Projects */}
        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-white font-medium text-sm">Recent Projects</h2>
            <Link href="/projects" className="text-brand-400 hover:text-brand-300 text-xs transition-colors">
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="p-5 text-gray-500 text-sm">Loading…</div>
          ) : !data?.recentProjects.length ? (
            <div className="p-5 text-gray-500 text-sm">No projects yet.</div>
          ) : (
            <div className="divide-y divide-surface-200">
              {data.recentProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-surface-100 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? "bg-gray-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{p.name}</p>
                    <p className="text-gray-500 text-xs">{p.client?.name ?? "No client"} · {p._count.rooms} room{p._count.rooms !== 1 ? "s" : ""}</p>
                  </div>
                  <p className="text-gray-600 text-xs flex-shrink-0">{new Date(p.updatedAt).toLocaleDateString()}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pending Installer Feedback */}
        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-white font-medium text-sm">Pending Field Feedback</h2>
            {(stats?.pendingFeedback ?? 0) > 0 && (
              <span className="text-xs text-red-400 bg-red-900/20 px-2 py-0.5 rounded-full">
                {stats?.pendingFeedback} unresolved
              </span>
            )}
          </div>
          {loading ? (
            <div className="p-5 text-gray-500 text-sm">Loading…</div>
          ) : !data?.recentFeedback.length ? (
            <div className="p-5 text-gray-500 text-sm">No pending feedback.</div>
          ) : (
            <div className="divide-y divide-surface-200">
              {data.recentFeedback.map((f) => (
                <Link
                  key={f.id}
                  href={`/projects/${f.projectId}/feedback`}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-surface-100 transition-colors"
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 capitalize ${SEV_COLOR[f.severity]}`}>
                    {f.severity}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{f.description}</p>
                    <p className="text-gray-500 text-xs capitalize">{f.category.replace(/_/g, " ")} · {f.reportedBy}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

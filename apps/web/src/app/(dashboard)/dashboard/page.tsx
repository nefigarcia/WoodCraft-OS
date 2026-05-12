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

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string; pulse?: boolean }> = {
  draft:         { bg: "#2E2E2E", color: "#5A6070", label: "Draft" },
  in_review:     { bg: "#2A2010", color: "#E8C547", label: "In Review" },
  approved:      { bg: "#0F2A14", color: "#4ADE80", label: "Approved" },
  in_production: { bg: "#1A1008", color: "#E8C547", label: "In Production", pulse: true },
  complete:      { bg: "#0A1A2A", color: "#60A5FA", label: "Complete" },
};

const SEV_STYLE: Record<string, { color: string; bg: string }> = {
  info:    { color: "#60A5FA", bg: "rgba(96,165,250,0.08)" },
  warning: { color: "#FBBF24", bg: "rgba(251,191,36,0.08)" },
  error:   { color: "#F87171", bg: "rgba(248,113,113,0.08)" },
};

const STAT_CARDS = [
  { key: "activeProjects",    label: "Active Projects",      href: "/projects",  accent: "#E8C547", icon: "◧" },
  { key: "openQuotes",        label: "Open Quotes",          href: undefined,    accent: "#5FC4C4", icon: "▦" },
  { key: "cncJobsThisMonth",  label: "CNC Jobs This Month",  href: undefined,    accent: "#B07EE8", icon: "⚙" },
  { key: "pendingFeedback",   label: "Pending Feedback",     href: undefined,    accent: "#E87070", icon: "◎" },
];

function StatCard({
  label,
  value,
  href,
  accent,
  icon,
  index,
}: {
  label: string;
  value: number | string;
  href?: string;
  accent: string;
  icon: string;
  index: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 80);
    return () => clearTimeout(t);
  }, [index]);

  const content = (
    <div
      className="stat-card"
      style={{
        background: "#111214",
        border: "1px solid #1E2226",
        borderRadius: 12,
        padding: "14px 16px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(10px)",
        transition: "opacity 0.4s ease, transform 0.4s ease",
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <p
          style={{
            fontSize: 10,
            letterSpacing: "2px",
            color: "#4A5060",
            textTransform: "uppercase",
          }}
        >
          {label}
        </p>
        <span style={{ fontSize: 14, color: accent, opacity: 0.7 }}>{icon}</span>
      </div>

      {/* Value */}
      <p
        className="text-3xl font-bold tabular-nums"
        style={{ color: "#fff" }}
      >
        {value}
      </p>

      {/* Accent bar */}
      <div
        style={{
          height: 2,
          marginTop: 14,
          background: "#1E2226",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: visible && value !== "—" ? "100%" : "0%",
            background: accent,
            transition: "width 0.8s ease",
            transitionDelay: `${index * 80 + 200}ms`,
            opacity: 0.6,
          }}
        />
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {content}
    </Link>
  ) : (
    content
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { bg: "#2E2E2E", color: "#5A6070", label: status };

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.pulse ? (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
            style={{ background: cfg.color }}
          />
          <span
            className="relative inline-flex rounded-full h-1.5 w-1.5"
            style={{ background: cfg.color }}
          />
        </span>
      ) : (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: cfg.color }}
        />
      )}
      {cfg.label}
    </span>
  );
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
    <div className="p-4 sm:p-6 md:p-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8 enter-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <span className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
              style={{ background: "#E8C547" }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "#E8C547" }}
            />
          </span>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        </div>
        <p className="text-gray-400 text-sm ml-4">Overview of your shop&apos;s activity.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
        {STAT_CARDS.map((card, i) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={loading ? "—" : (stats?.[card.key as keyof DashboardStats] ?? 0)}
            href={card.href}
            accent={card.accent}
            icon={card.icon}
            index={i}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Recent Projects */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#111214", border: "1px solid #1E2226" }}
        >
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid #1E2226" }}
          >
            <h2 className="text-white font-medium text-sm flex items-center gap-2">
              <span style={{ color: "#E8C547", fontSize: 12 }}>◧</span>
              Recent Projects
            </h2>
            <Link
              href="/projects"
              className="text-xs transition-colors"
              style={{ color: "#E8C547" }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#F0D060")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#E8C547")}
            >
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="p-5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded mb-2"
                  style={{
                    background: "linear-gradient(90deg, #1A1E24 30%, #222629 50%, #1A1E24 70%)",
                    backgroundSize: "300% 100%",
                    animation: "card-shimmer 1.5s linear infinite",
                    animationDelay: `${i * 150}ms`,
                  }}
                />
              ))}
            </div>
          ) : !data?.recentProjects.length ? (
            <div className="p-5 text-gray-500 text-sm">No projects yet.</div>
          ) : (
            <div>
              {data.recentProjects.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors"
                  style={{
                    borderBottom: "1px solid #1E2226",
                    animationDelay: `${i * 60}ms`,
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "#1A1E24")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  <StatusBadge status={p.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm truncate">{p.name}</p>
                    <p className="text-gray-500 text-xs">
                      {p.client?.name ?? "No client"} · {p._count.rooms} room
                      {p._count.rooms !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-gray-600 text-xs flex-shrink-0">
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pending Installer Feedback */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#111214", border: "1px solid #1E2226" }}
        >
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid #1E2226" }}
          >
            <h2 className="text-white font-medium text-sm flex items-center gap-2">
              <span style={{ color: "#E87070", fontSize: 12 }}>◎</span>
              Pending Field Feedback
            </h2>
            {(stats?.pendingFeedback ?? 0) > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1.5"
                style={{ color: "#F87171", background: "rgba(248,113,113,0.08)" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                    style={{ background: "#F87171" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ background: "#F87171" }}
                  />
                </span>
                {stats?.pendingFeedback} unresolved
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-5">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded mb-2"
                  style={{
                    background: "linear-gradient(90deg, #1A1E24 30%, #222629 50%, #1A1E24 70%)",
                    backgroundSize: "300% 100%",
                    animation: "card-shimmer 1.5s linear infinite",
                    animationDelay: `${i * 150}ms`,
                  }}
                />
              ))}
            </div>
          ) : !data?.recentFeedback.length ? (
            <div className="p-5 text-gray-500 text-sm">No pending feedback.</div>
          ) : (
            <div>
              {data.recentFeedback.map((f) => {
                const sev = SEV_STYLE[f.severity] ?? SEV_STYLE.info;
                return (
                  <Link
                    key={f.id}
                    href={`/projects/${f.projectId}/feedback`}
                    className="flex items-start gap-3 px-5 py-3 transition-colors"
                    style={{ borderBottom: "1px solid #1E2226" }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "#1A1E24")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.background = "transparent")
                    }
                  >
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 capitalize font-medium"
                      style={{ color: sev.color, background: sev.bg }}
                    >
                      {f.severity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm truncate">{f.description}</p>
                      <p className="text-gray-500 text-xs capitalize">
                        {f.category.replace(/_/g, " ")} · {f.reportedBy}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

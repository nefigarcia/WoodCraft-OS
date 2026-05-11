import { Metadata } from "next";

export const metadata: Metadata = { title: "Dashboard — WoodCraft OS" };

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-gray-400 text-sm mb-8">
        Overview of your active projects and production runs.
      </p>

      {/* Placeholder stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Projects", value: "—" },
          { label: "Open Quotes", value: "—" },
          { label: "CNC Jobs", value: "—" },
          { label: "Pending Feedback", value: "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-surface-50 border border-surface-200 rounded-xl p-5"
          >
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">
              {stat.label}
            </p>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-50 border border-surface-200 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">
          Projects and activity feed will appear here.
        </p>
      </div>
    </div>
  );
}

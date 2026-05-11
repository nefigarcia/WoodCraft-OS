import Link from "next/link";

const SETTINGS = [
  { href: "/settings/machines", title: "Machine Profiles", desc: "CNC routers, panel saws, edge banders and their post-processors." },
  { href: "/settings/hardware", title: "Hardware Catalogue", desc: "Hinges, drawer slides, handles and other hardware used in quotes." },
];

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
      <p className="text-gray-400 text-sm mb-8">Shop configuration and catalogues.</p>

      <div className="space-y-3">
        {SETTINGS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="block bg-surface-50 border border-surface-200 hover:border-surface-300 rounded-xl p-5 transition-colors"
          >
            <p className="text-white font-medium mb-0.5">{s.title}</p>
            <p className="text-gray-400 text-sm">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

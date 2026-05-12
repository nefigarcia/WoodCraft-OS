"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { SearchBar } from "@/components/layout/SearchBar";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/clients", label: "Clients" },
  { href: "/materials", label: "Materials" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, org, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted && !user) router.replace("/login"); }, [mounted, user, router]);

  if (!mounted || !user) return null;

  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
        <div className="px-4 py-4 border-b border-surface-200">
          <span className="text-brand-400 font-bold text-base tracking-tight">WoodCraft OS</span>
          <p className="text-gray-500 text-xs mt-0.5 truncate">{org?.name}</p>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith(item.href)
                  ? "bg-surface-200 text-white"
                  : "text-gray-400 hover:text-white hover:bg-surface-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-surface-200">
          <p className="text-gray-400 text-xs truncate mb-1.5">
            {user.firstName} {user.lastName}
            <span className={`ml-1.5 text-[10px] capitalize ${user.role === "owner" ? "text-brand-400" : "text-gray-600"}`}>
              {user.role}
            </span>
          </p>
          <button onClick={logout} className="text-gray-500 hover:text-red-400 text-xs transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      {/* Right column: top bar + scrollable content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-11 flex-shrink-0 bg-surface-50 border-b border-surface-200 flex items-center gap-3 px-4">
          <SearchBar />
          <div className="flex-1" />
          <NotificationBell />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { SearchBar } from "@/components/layout/SearchBar";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/projects",  label: "Projects",  icon: "◧" },
  { href: "/clients",   label: "Clients",   icon: "◎" },
  { href: "/materials", label: "Materials", icon: "⬡" },
  { href: "/settings",  label: "Settings",  icon: "⚙" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, org, logout } = useAuthStore();
  const [mounted, setMounted]       = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Redirect unauthenticated users
  useEffect(() => {
    if (mounted && !user) router.replace("/login");
  }, [mounted, user, router]);

  // Close sidebar on every navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!mounted || !user) return null;

  return (
    <div className="flex h-screen bg-surface text-white overflow-hidden">

      {/* ── Mobile backdrop ───────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      {/*
          Mobile  : position fixed, slides in/out with translate.
          Desktop : position relative (in flex flow), always visible.
      */}
      <aside
        className={[
          // layout shared
          "flex flex-col flex-shrink-0",
          // mobile: fixed overlay
          "fixed inset-y-0 left-0 z-30 w-64",
          "transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // desktop: back in normal flow, no transform
          "md:static md:w-52 md:translate-x-0 md:transition-none md:z-auto",
        ].join(" ")}
        style={{ background: "#111214", borderRight: "1px solid #1E2226" }}
      >
        {/* Logo row */}
        <div
          className="px-4 py-4 flex items-center gap-2"
          style={{ borderBottom: "1px solid #1E2226" }}
        >
          {/* Pulse dot */}
          <span className="relative flex h-3 w-3 flex-shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: "#E8C547" }}
            />
            <span
              className="dot-breathe relative inline-flex rounded-full h-3 w-3"
              style={{ background: "#E8C547" }}
            />
          </span>

          <div className="flex-1 min-w-0">
            <span
              className="font-bold text-sm tracking-tight"
              style={{ color: "#E8C547", fontFamily: "monospace", letterSpacing: "1px" }}
            >
              WoodCraft OS
            </span>
            <p className="text-gray-500 text-xs mt-0.5 truncate">{org?.name}</p>
          </div>

          {/* Close button — mobile only */}
          <button
            className="md:hidden flex-shrink-0 text-gray-500 hover:text-white transition-colors p-1"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-auto">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm relative"
                style={{
                  background: active ? "#1E2226" : "transparent",
                  color: active ? "#fff" : "#5A6070",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = "#9A9288";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = "#5A6070";
                }}
              >
                {/* Active left bar */}
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-sm"
                  style={{
                    width: 2,
                    height: active ? "60%" : "0%",
                    background: "#E8C547",
                    transition: "height 0.2s ease",
                  }}
                />

                {/* Icon */}
                <span
                  className="text-xs flex-shrink-0"
                  style={{ color: active ? "#E8C547" : "#3A4050" }}
                >
                  {item.icon}
                </span>

                {/* Label */}
                <span className="flex-1">{item.label}</span>

                {/* Active pulse dot */}
                {active && (
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                      style={{ background: "#E8C547" }}
                    />
                    <span
                      className="dot-breathe relative inline-flex rounded-full h-2 w-2"
                      style={{ background: "#E8C547" }}
                    />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div
          className="px-3 py-3 flex items-center gap-2"
          style={{ borderTop: "1px solid #1E2226" }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
            style={{ background: "#1E2226", color: "#E8C547" }}
          >
            {user.firstName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-gray-400 text-xs truncate">
              {user.firstName} {user.lastName}
              <span
                className="ml-1.5 text-[9px] capitalize"
                style={{ color: user.role === "owner" ? "#E8C547" : "#5A6070" }}
              >
                {user.role}
              </span>
            </p>
          </div>
          <button
            onClick={logout}
            className="text-[13px] flex-shrink-0 transition-colors"
            style={{ color: "#3A4050" }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#E87070")}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#3A4050")}
            title="Sign out"
          >
            ⏻
          </button>
        </div>

        {/* Copyright */}
        <div className="px-3 py-2" style={{ borderTop: "1px solid #1E2226" }}>
          <p className="text-[9px] text-center" style={{ color: "#2E3038", letterSpacing: "0.5px" }}>
            © 2026 rosys.im · (828) 827-3145
          </p>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <div
          className="h-11 flex-shrink-0 flex items-center gap-2 px-3"
          style={{ background: "#111214", borderBottom: "1px solid #1E2226" }}
        >
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden flex-shrink-0 flex flex-col gap-1 p-1.5 rounded transition-colors hover:bg-white/5"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span className="block w-4 h-px bg-gray-400" />
            <span className="block w-4 h-px bg-gray-400" />
            <span className="block w-3 h-px bg-gray-400" />
          </button>

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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface NotifItem {
  id: string;
  kind: "feedback" | "quote";
  title: string;
  body: string;
  href: string;
  at: string;
}

interface NotifData {
  total: number;
  feedback: NotifItem[];
  quotes: NotifItem[];
}

const SEV_DOT: Record<string, string> = {
  info: "bg-blue-400",
  warning: "bg-yellow-400",
  error: "bg-red-400",
};

export function NotificationBell() {
  const [data, setData] = useState<NotifData | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const lastSeen =
    typeof window !== "undefined"
      ? localStorage.getItem("notif_last_seen") ?? new Date(0).toISOString()
      : new Date(0).toISOString();

  useEffect(() => {
    apiClient
      .get<NotifData>(`/notifications?since=${encodeURIComponent(lastSeen)}`)
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function markRead() {
    localStorage.setItem("notif_last_seen", new Date().toISOString());
    setData((d) => d ? { ...d, total: 0 } : d);
    setOpen(false);
  }

  const unread = data?.total ?? 0;
  const all: NotifItem[] = [...(data?.feedback ?? []), ...(data?.quotes ?? [])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-surface-200 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-80 bg-surface-50 border border-surface-200 rounded-xl shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
            <span className="text-white text-sm font-medium">Notifications</span>
            {unread > 0 && (
              <button onClick={markRead} className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
                Mark all read
              </button>
            )}
          </div>

          {all.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-6">All caught up.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-surface-200">
              {all.map((item) => (
                <Link
                  key={`${item.kind}-${item.id}`}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-surface-100 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    item.kind === "quote" ? "bg-brand-400" :
                    SEV_DOT[(item as NotifItem & { severity?: string }).severity ?? "info"] ?? "bg-blue-400"
                  }`} />
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium">{item.title}</p>
                    <p className="text-gray-400 text-xs truncate">{item.body}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{new Date(item.at).toLocaleDateString()}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

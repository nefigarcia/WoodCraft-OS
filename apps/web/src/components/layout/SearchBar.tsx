"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";

interface SearchResult {
  query: string;
  total: number;
  projects: { id: string; name: string; status: string; client: { name: string } | null }[];
  clients: { id: string; name: string; email: string | null }[];
  cabinets: { id: string; name: string; type: string; room: { projectId: string } }[];
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults(null); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await apiClient.get<SearchResult>(`/search?q=${encodeURIComponent(query)}`);
        setResults(data);
        setOpen(true);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const hasResults = results && results.total > 0;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-sm">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search…"
          className="w-full bg-surface-100 border border-surface-300 rounded-md pl-8 pr-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 bg-surface-200 px-1 py-0.5 rounded hidden sm:block">
          ⌘K
        </kbd>
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-9 left-0 right-0 bg-surface-50 border border-surface-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {loading && (
            <p className="text-gray-500 text-xs px-4 py-3">Searching…</p>
          )}

          {!loading && !hasResults && (
            <p className="text-gray-500 text-xs px-4 py-3">No results for "{query}"</p>
          )}

          {!loading && hasResults && (
            <div className="max-h-72 overflow-y-auto">
              {results.projects.length > 0 && (
                <div>
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider px-4 pt-3 pb-1">Projects</p>
                  {results.projects.map((p) => (
                    <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-surface-100 transition-colors">
                      <span className="text-white text-sm truncate">{p.name}</span>
                      <span className="text-gray-500 text-xs flex-shrink-0">{p.client?.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.clients.length > 0 && (
                <div>
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider px-4 pt-3 pb-1">Clients</p>
                  {results.clients.map((c) => (
                    <button key={c.id} onClick={() => navigate("/clients")}
                      className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-surface-100 transition-colors">
                      <span className="text-white text-sm">{c.name}</span>
                      {c.email && <span className="text-gray-500 text-xs">{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
              {results.cabinets.length > 0 && (
                <div className="border-t border-surface-200">
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider px-4 pt-3 pb-1">Cabinets</p>
                  {results.cabinets.map((c) => (
                    <button key={c.id} onClick={() => navigate(`/projects/${c.room.projectId}/editor`)}
                      className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-surface-100 transition-colors">
                      <span className="text-white text-sm">{c.name}</span>
                      <span className="text-gray-500 text-xs capitalize">{c.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

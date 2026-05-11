"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface Client { id: string; name: string; email: string | null; phone: string | null; createdAt: string }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<{ data: Client[] }>("/clients")
      .then((r) => setClients(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function createClient(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const client = await apiClient.post<Client>("/clients", form);
      setClients((prev) => [client, ...prev]);
      setShowNew(false);
      setForm({ name: "", email: "", phone: "" });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Clients</h1>
          <p className="text-gray-400 text-sm">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Client
        </button>
      </div>

      {showNew && (
        <form onSubmit={createClient} className="bg-surface-50 border border-surface-200 rounded-xl p-5 mb-6 max-w-md">
          <h3 className="text-white font-medium mb-4">New Client</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setShowNew(false)} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
            <button type="submit" disabled={saving} className="text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors">
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : clients.length === 0 && !showNew ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No clients yet.</p>
        </div>
      ) : (
        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Phone</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-surface-200 last:border-0 hover:bg-surface-100">
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-400">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface Feedback {
  id: string;
  cabinetId: string | null;
  reportedBy: string;
  severity: "info" | "warning" | "error";
  category: string;
  description: string;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

const CATEGORIES = ["dimension_mismatch", "missing_part", "hardware_issue", "other"] as const;
const SEVERITIES = ["info", "warning", "error"] as const;

const SEV_BADGE: Record<string, string> = {
  info: "text-blue-400 bg-blue-900/20",
  warning: "text-yellow-400 bg-yellow-900/20",
  error: "text-red-400 bg-red-900/20",
};

const BLANK = { reportedBy: "", severity: "warning" as const, category: "dimension_mismatch" as const, description: "", cabinetId: "" };

export default function FeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");

  async function load() {
    setLoading(true);
    const resolved = filter === "all" ? undefined : filter === "resolved" ? "true" : "false";
    const qs = resolved !== undefined ? `?resolved=${resolved}` : "";
    apiClient.get<{ data: Feedback[] }>(`/projects/${id}/installer-feedback${qs}`)
      .then((r) => setItems(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { void load(); }, [id, filter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, cabinetId: form.cabinetId || undefined };
      const created = await apiClient.post<Feedback>(`/projects/${id}/installer-feedback`, payload);
      setItems((p) => [created, ...p]);
      setShowForm(false);
      setForm(BLANK);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function resolve(feedbackId: string) {
    try {
      await apiClient.patch(`/projects/${id}/installer-feedback/${feedbackId}`, { resolved: true });
      setItems((p) => p.map((f) => f.id === feedbackId ? { ...f, resolved: true, resolvedAt: new Date().toISOString() } : f));
    } catch (err) { console.error(err); }
  }

  async function handleDelete(feedbackId: string) {
    if (!confirm("Delete this feedback item?")) return;
    try {
      await apiClient.delete(`/projects/${id}/installer-feedback/${feedbackId}`);
      setItems((p) => p.filter((f) => f.id !== feedbackId));
    } catch (err) { console.error(err); }
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  const openCount = items.filter((f) => !f.resolved).length;

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href={`/projects/${id}`} className="text-gray-500 hover:text-gray-300 text-sm">← Project</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Field Feedback</h1>
          {openCount > 0 && (
            <p className="text-red-400 text-sm mt-0.5">{openCount} unresolved issue{openCount !== 1 ? "s" : ""}</p>
          )}
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Report Issue
        </button>
      </div>

      {/* Report form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-50 border border-surface-200 rounded-xl p-5 mb-6 space-y-3">
          <h3 className="text-white font-medium text-sm">New Field Report</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Reported by *</label>
              <input required value={form.reportedBy} onChange={f("reportedBy")} placeholder="Installer name" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="w-32">
              <label className="block text-xs text-gray-400 mb-1">Severity</label>
              <select value={form.severity} onChange={f("severity")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="w-48">
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select value={form.category} onChange={f("category")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description *</label>
            <textarea required value={form.description} onChange={f("description")} rows={3} placeholder="Describe the issue in detail…" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
            <button type="submit" disabled={saving} className="text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors">
              {saving ? "Saving…" : "Submit Report"}
            </button>
          </div>
        </form>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(["open", "all", "resolved"] as const).map((tab) => (
          <button key={tab} onClick={() => setFilter(tab)} className={`text-sm px-3 py-1.5 rounded-md capitalize transition-colors ${filter === tab ? "bg-surface-200 text-white" : "text-gray-400 hover:text-white"}`}>
            {tab}
          </button>
        ))}
      </div>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : items.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No {filter === "all" ? "" : filter} issues.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className={`bg-surface-50 border rounded-xl p-4 ${item.resolved ? "border-surface-200 opacity-60" : "border-surface-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 capitalize ${SEV_BADGE[item.severity]}`}>{item.severity}</span>
                  <div className="min-w-0">
                    <p className="text-white text-sm">{item.description}</p>
                    <p className="text-gray-500 text-xs mt-0.5 capitalize">
                      {item.category.replace(/_/g, " ")} · {item.reportedBy} · {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                    {item.resolved && item.resolvedAt && (
                      <p className="text-green-500 text-xs mt-0.5">Resolved {new Date(item.resolvedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!item.resolved && (
                    <button onClick={() => void resolve(item.id)} className="text-xs text-green-400 hover:text-green-300 transition-colors">
                      Resolve
                    </button>
                  )}
                  <button onClick={() => void handleDelete(item.id)} className="text-xs text-gray-600 hover:text-red-400 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface ProductionRun {
  id: string;
  status: "scheduled" | "in_progress" | "complete" | "cancelled";
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  scheduled: { label: "Scheduled", color: "text-yellow-400 bg-yellow-900/20", next: "in_progress", nextLabel: "Start" },
  in_progress: { label: "In Progress", color: "text-brand-400 bg-brand-900/20", next: "complete", nextLabel: "Complete" },
  complete: { label: "Complete", color: "text-green-400 bg-green-900/20" },
  cancelled: { label: "Cancelled", color: "text-gray-500 bg-gray-900/20" },
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default function ProductionPage() {
  const { id } = useParams<{ id: string }>();
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<ProductionRun[]>(`/projects/${id}/production-runs`)
      .then(setRuns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function createRun(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const run = await apiClient.post<ProductionRun>(`/projects/${id}/production-runs`, {
        scheduledAt: scheduledAt || undefined,
        notes: notes || undefined,
      });
      setRuns((p) => [run, ...p]);
      setCreating(false);
      setScheduledAt("");
      setNotes("");
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function updateStatus(runId: string, status: string) {
    try {
      const updated = await apiClient.patch<ProductionRun>(`/projects/${id}/production-runs/${runId}`, { status });
      setRuns((p) => p.map((r) => r.id === runId ? updated : r));
    } catch (err) { console.error(err); }
  }

  async function cancelRun(runId: string) {
    if (!confirm("Cancel this production run?")) return;
    await updateStatus(runId, "cancelled");
  }

  const activeRun = runs.find((r) => r.status === "in_progress");

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href={`/projects/${id}`} className="text-gray-500 hover:text-gray-300 text-sm">← Project</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Production Runs</h1>
          {activeRun && (
            <p className="text-brand-400 text-sm mt-0.5">Run in progress — started {fmt(activeRun.startedAt)}</p>
          )}
        </div>
        <button
          onClick={() => setCreating(!creating)}
          disabled={!!activeRun}
          title={activeRun ? "Complete the current run first" : undefined}
          className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + Schedule Run
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <form onSubmit={createRun} className="bg-surface-50 border border-surface-200 rounded-xl p-5 mb-6 space-y-3">
          <h3 className="text-white font-medium text-sm">Schedule Production Run</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Scheduled date (optional)</label>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Batch notes, operator, machine…"
              className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
            <button type="submit" disabled={saving} className="text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors">
              {saving ? "Saving…" : "Schedule"}
            </button>
          </div>
        </form>
      )}

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : runs.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No production runs yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const cfg = STATUS_CONFIG[run.status]!;
            return (
              <div key={run.id} className="bg-surface-50 border border-surface-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-gray-500 text-xs">{new Date(run.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                      <div><p className="text-gray-600 mb-0.5">Scheduled</p><p>{fmt(run.scheduledAt)}</p></div>
                      <div><p className="text-gray-600 mb-0.5">Started</p><p>{fmt(run.startedAt)}</p></div>
                      <div><p className="text-gray-600 mb-0.5">Completed</p><p>{fmt(run.completedAt)}</p></div>
                    </div>
                    {run.notes && <p className="text-gray-400 text-xs mt-2 italic">"{run.notes}"</p>}
                  </div>
                  {run.status !== "complete" && run.status !== "cancelled" && (
                    <div className="flex gap-2 flex-shrink-0">
                      {cfg.next && (
                        <button
                          onClick={() => void updateStatus(run.id, cfg.next!)}
                          className="text-xs bg-surface-200 hover:bg-surface-300 text-white px-3 py-1.5 rounded-md transition-colors"
                        >
                          {cfg.nextLabel}
                        </button>
                      )}
                      <button
                        onClick={() => void cancelRun(run.id)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

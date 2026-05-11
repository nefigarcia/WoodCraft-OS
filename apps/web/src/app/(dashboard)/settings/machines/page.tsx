"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface MachineProfile {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  type: string;
  postProcessor: string;
}

const MACHINE_TYPES = ["cnc_router", "panel_saw", "edge_bander"] as const;

const BLANK = { name: "", manufacturer: "", model: "", type: "cnc_router" as const, postProcessor: "holzher_dynestic_7507", config: {} };

export default function MachinesPage() {
  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new" | MachineProfile | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<MachineProfile[]>("/machine-profiles")
      .then(setProfiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openNew() { setForm(BLANK); setModal("new"); }
  function openEdit(p: MachineProfile) {
    setForm({ name: p.name, manufacturer: p.manufacturer, model: p.model, type: p.type as typeof BLANK.type, postProcessor: p.postProcessor, config: {} });
    setModal(p);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === "new") {
        const created = await apiClient.post<MachineProfile>("/machine-profiles", form);
        setProfiles((p) => [...p, created]);
      } else if (modal) {
        const updated = await apiClient.patch<MachineProfile>(`/machine-profiles/${(modal as MachineProfile).id}`, form);
        setProfiles((p) => p.map((x) => x.id === updated.id ? updated : x));
      }
      setModal(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this machine profile?")) return;
    try {
      await apiClient.delete(`/machine-profiles/${id}`);
      setProfiles((p) => p.filter((x) => x.id !== id));
    } catch (err) { console.error(err); }
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/settings" className="text-gray-500 hover:text-gray-300 text-sm">← Settings</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Machine Profiles</h1>
        </div>
        <button onClick={openNew} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Add Machine
        </button>
      </div>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : profiles.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No machines yet.</p>
          <p className="text-gray-600 text-xs mt-1">Add your CNC machine to enable G-code export.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="bg-surface-50 border border-surface-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-white font-medium">{p.name}</p>
                <p className="text-gray-400 text-sm">{p.manufacturer} {p.model} · <span className="capitalize">{p.type.replace(/_/g, " ")}</span></p>
                <p className="text-gray-600 text-xs font-mono mt-0.5">{p.postProcessor}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => openEdit(p)} className="text-gray-500 hover:text-white text-xs transition-colors">Edit</button>
                <button onClick={() => void handleDelete(p.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 w-[460px] shadow-xl">
            <h3 className="text-white font-semibold mb-5">{modal === "new" ? "Add Machine" : "Edit Machine"}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Profile name *</label>
                <input required value={form.name} onChange={f("name")} placeholder="Shop CNC #1" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Manufacturer *</label>
                  <input required value={form.manufacturer} onChange={f("manufacturer")} placeholder="HOLZHER" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Model *</label>
                  <input required value={form.model} onChange={f("model")} placeholder="dynestic 7507" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Type *</label>
                  <select value={form.type} onChange={f("type")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                    {MACHINE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Post-processor *</label>
                  <input required value={form.postProcessor} onChange={f("postProcessor")} placeholder="holzher_dynestic_7507" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="flex-1 text-sm text-gray-400 hover:text-white py-2 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2 rounded-md transition-colors">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface Hardware {
  id: string;
  name: string;
  type: string;
  sku: string | null;
  supplier: string | null;
  costPerUnit: number;
}

const HARDWARE_TYPES = ["hinge", "drawer_slide", "handle", "screw", "cam_lock", "shelf_pin", "soft_close", "other"] as const;
const BLANK = { name: "", type: "hinge" as const, sku: "", supplier: "", costPerUnit: 0 };

export default function HardwarePage() {
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new" | Hardware | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<{ data: Hardware[] }>("/hardware?pageSize=100")
      .then((r) => setHardware(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openNew() { setForm(BLANK); setModal("new"); }
  function openEdit(h: Hardware) {
    setForm({ name: h.name, type: h.type as typeof BLANK.type, sku: h.sku ?? "", supplier: h.supplier ?? "", costPerUnit: Number(h.costPerUnit) });
    setModal(h);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, sku: form.sku || undefined, supplier: form.supplier || undefined };
      if (modal === "new") {
        const created = await apiClient.post<Hardware>("/hardware", payload);
        setHardware((p) => [...p, created]);
      } else if (modal) {
        const updated = await apiClient.patch<Hardware>(`/hardware/${(modal as Hardware).id}`, payload);
        setHardware((p) => p.map((x) => x.id === updated.id ? updated : x));
      }
      setModal(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this hardware item?")) return;
    try {
      await apiClient.delete(`/hardware/${id}`);
      setHardware((p) => p.filter((x) => x.id !== id));
    } catch (err) { console.error(err); }
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/settings" className="text-gray-500 hover:text-gray-300 text-sm">← Settings</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Hardware Catalogue</h1>
        </div>
        <button onClick={openNew} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          + Add Hardware
        </button>
      </div>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : hardware.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No hardware yet. Add hinges, slides, and handles to include them in quotes.</p>
        </div>
      ) : (
        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                {["Name", "Type", "Supplier", "SKU", "Cost/Unit", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-gray-400 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hardware.map((h) => (
                <tr key={h.id} className="border-b border-surface-200 last:border-0 hover:bg-surface-100">
                  <td className="px-4 py-3 text-white font-medium">{h.name}</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{h.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-500">{h.supplier ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{h.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">${Number(h.costPerUnit).toFixed(4)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(h)} className="text-gray-500 hover:text-white text-xs transition-colors">Edit</button>
                      <button onClick={() => void handleDelete(h.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 w-[420px] shadow-xl">
            <h3 className="text-white font-semibold mb-5">{modal === "new" ? "Add Hardware" : "Edit Hardware"}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name *</label>
                <input required value={form.name} onChange={f("name")} placeholder="Blum CLIP top 110°" className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Type *</label>
                  <select value={form.type} onChange={f("type")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                    {HARDWARE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Cost/Unit ($)</label>
                  <input type="number" step="0.0001" required value={form.costPerUnit} onChange={f("costPerUnit")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Supplier</label>
                  <input value={form.supplier} onChange={f("supplier")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">SKU</label>
                  <input value={form.sku} onChange={f("sku")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
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

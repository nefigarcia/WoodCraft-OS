"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface Material {
  id: string;
  name: string;
  type: string;
  thickness: number;
  sheetWidth: number;
  sheetHeight: number;
  costPerSheet: number;
  supplier: string | null;
  sku: string | null;
}

type MaterialType = "plywood" | "mdf" | "solid_wood" | "melamine" | "laminate";

const MATERIAL_TYPES: MaterialType[] = ["plywood", "mdf", "solid_wood", "melamine", "laminate"];

const BLANK: Omit<Material, "id"> = {
  name: "", type: "plywood", thickness: 18, sheetWidth: 2440,
  sheetHeight: 1220, costPerSheet: 0, supplier: null, sku: null,
};

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"new" | Material | null>(null);
  const [form, setForm] = useState<Omit<Material, "id">>(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get<{ data: Material[] }>("/materials?pageSize=100")
      .then((r) => setMaterials(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function openNew() { setForm(BLANK); setModal("new"); }
  function openEdit(m: Material) { setForm({ name: m.name, type: m.type as MaterialType, thickness: Number(m.thickness), sheetWidth: Number(m.sheetWidth), sheetHeight: Number(m.sheetHeight), costPerSheet: Number(m.costPerSheet), supplier: m.supplier, sku: m.sku }); setModal(m); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      supplier: form.supplier?.trim() || null,
      sku: form.sku?.trim() || null,
    };
    try {
      if (modal === "new") {
        const created = await apiClient.post<Material>("/materials", payload);
        setMaterials((p) => [...p, created]);
      } else if (modal) {
        const updated = await apiClient.patch<Material>(`/materials/${(modal as Material).id}`, payload);
        setMaterials((p) => p.map((m) => m.id === updated.id ? updated : m));
      }
      setModal(null);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this material?")) return;
    try {
      await apiClient.delete(`/materials/${id}`);
      setMaterials((p) => p.filter((m) => m.id !== id));
    } catch (err) { console.error(err); }
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Materials</h1>
          <p className="text-gray-400 text-sm">Sheet goods catalogue for your shop.</p>
        </div>
        <button onClick={openNew} className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + Add Material
        </button>
      </div>

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : materials.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No materials yet. Add your first sheet good.</p>
        </div>
      ) : (
        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left">
                {["Name", "Type", "Thickness", "Sheet Size", "Cost/Sheet", "Supplier", "SKU", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-gray-400 font-medium text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className="border-b border-surface-200 last:border-0 hover:bg-surface-100">
                  <td className="px-4 py-3 text-white font-medium">{m.name}</td>
                  <td className="px-4 py-3 text-gray-400 capitalize">{m.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{Number(m.thickness)}mm</td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{Number(m.sheetWidth)}×{Number(m.sheetHeight)}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">${Number(m.costPerSheet).toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{m.supplier ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{m.sku ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button onClick={() => openEdit(m)} className="text-gray-500 hover:text-white text-xs transition-colors">Edit</button>
                      <button onClick={() => void handleDelete(m.id)} className="text-gray-600 hover:text-red-400 text-xs transition-colors">Delete</button>
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
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 w-[480px] shadow-xl">
            <h3 className="text-white font-semibold mb-5">{modal === "new" ? "Add Material" : "Edit Material"}</h3>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Name *</label>
                  <input required value={form.name} onChange={f("name")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="w-36">
                  <label className="block text-xs text-gray-400 mb-1">Type *</label>
                  <select value={form.type} onChange={f("type")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                    {MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                {(["thickness", "sheetWidth", "sheetHeight"] as const).map((field) => (
                  <div key={field} className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1 capitalize">{field === "sheetWidth" ? "Sheet W" : field === "sheetHeight" ? "Sheet H" : "Thickness"} (mm)</label>
                    <input type="number" required value={form[field]} onChange={f(field)} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 tabular-nums" />
                  </div>
                ))}
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Cost/Sheet ($)</label>
                  <input type="number" step="0.01" required value={form.costPerSheet} onChange={f("costPerSheet")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 tabular-nums" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">Supplier</label>
                  <input value={form.supplier ?? ""} onChange={f("supplier")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-400 mb-1">SKU</label>
                  <input value={form.sku ?? ""} onChange={f("sku")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setModal(null)} className="flex-1 text-sm text-gray-400 hover:text-white py-2 rounded-md transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2 rounded-md transition-colors">
                  {saving ? "Saving…" : modal === "new" ? "Add" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

interface MaterialGroup {
  materialName: string;
  estimatedSheets: number;
  costPerSheet: number | null;
  estimatedMaterialCost: number;
}

interface Cutlist {
  byMaterial: MaterialGroup[];
  summary: { totalPieces: number; estimatedMaterialCost: number };
}

function newItem(description = "", qty = 1, unitPrice = 0): LineItem {
  return { description, qty, unitPrice };
}

const LABOR_RATE_PER_PIECE = 8; // $8 default labor per cut piece

export default function NewQuotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromCutlist = searchParams.get("fromCutlist") === "1";

  const [lineItems, setLineItems] = useState<LineItem[]>([newItem()]);
  const [taxRate, setTaxRate] = useState(0.13);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [populatingFromCutlist, setPopulatingFromCutlist] = useState(false);

  // Auto-populate from cut list when navigated from the cut list page
  useEffect(() => {
    if (!fromCutlist) return;
    setPopulatingFromCutlist(true);
    apiClient
      .get<Cutlist>(`/projects/${id}/cutlist`)
      .then((cutlist) => {
        const items: LineItem[] = [];

        // One line item per material
        for (const mat of cutlist.byMaterial) {
          if (mat.estimatedMaterialCost > 0) {
            items.push(
              newItem(
                `Material: ${mat.materialName} (${mat.estimatedSheets} sheet${mat.estimatedSheets !== 1 ? "s" : ""})`,
                mat.estimatedSheets,
                mat.costPerSheet ?? 0
              )
            );
          }
        }

        // Labor line item
        if (cutlist.summary.totalPieces > 0) {
          items.push(
            newItem(
              `Labour: cutting & assembly (${cutlist.summary.totalPieces} pieces)`,
              cutlist.summary.totalPieces,
              LABOR_RATE_PER_PIECE
            )
          );
        }

        if (items.length > 0) setLineItems(items);
      })
      .catch(console.error)
      .finally(() => setPopulatingFromCutlist(false));
  }, [id, fromCutlist]);

  const subtotal = lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  function updateItem(index: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  }

  function removeItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validItems = lineItems.filter((i) => i.description.trim());
    if (validItems.length === 0) return;

    setLoading(true);
    try {
      const quote = await apiClient.post<{ id: string }>(`/projects/${id}/quotes`, {
        lineItems: validItems,
        taxRate,
        notes,
      });
      router.push(`/projects/${id}/quotes`);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href={`/projects/${id}/quotes`} className="text-gray-500 hover:text-gray-300 text-sm">← Quotes</Link>
        <h1 className="text-2xl font-bold text-white mt-1">New Quote</h1>
        {populatingFromCutlist && (
          <p className="text-gray-400 text-sm mt-1">Importing from cut list…</p>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Line Items */}
        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
            <h3 className="text-white font-medium text-sm">Line Items</h3>
            <button
              type="button"
              onClick={() => setLineItems((p) => [...p, newItem()])}
              className="text-brand-400 hover:text-brand-300 text-sm transition-colors"
            >
              + Add line
            </button>
          </div>

          <div className="divide-y divide-surface-200">
            {lineItems.map((item, i) => {
              const lineTotal = item.qty * item.unitPrice;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                    placeholder="Description"
                    className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-gray-600"
                  />
                  <input
                    type="number"
                    value={item.qty}
                    min={0.01}
                    step={0.01}
                    onChange={(e) => updateItem(i, "qty", Number(e.target.value))}
                    className="w-16 bg-surface-100 border border-surface-300 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-500 tabular-nums"
                  />
                  <span className="text-gray-500 text-xs">×</span>
                  <input
                    type="number"
                    value={item.unitPrice}
                    min={0}
                    step={0.01}
                    onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))}
                    className="w-24 bg-surface-100 border border-surface-300 rounded px-2 py-1 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-500 tabular-nums"
                  />
                  <span className="w-24 text-right text-white text-xs tabular-nums font-medium">
                    ${lineTotal.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <span>Subtotal</span>
            <span className="tabular-nums">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>
              Tax{" "}
              <input
                type="number"
                value={(taxRate * 100).toFixed(1)}
                min={0}
                max={100}
                step={0.1}
                onChange={(e) => setTaxRate(Number(e.target.value) / 100)}
                className="w-14 bg-surface-100 border border-surface-300 rounded px-1.5 py-0.5 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-500 ml-1 tabular-nums"
              />
              %
            </span>
            <span className="tabular-nums">${taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-base text-white font-semibold border-t border-surface-200 pt-2">
            <span>Total</span>
            <span className="tabular-nums">${total.toFixed(2)}</span>
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Payment terms, inclusions, exclusions…"
            className="w-full bg-surface-50 border border-surface-200 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <Link
            href={`/projects/${id}/quotes`}
            className="text-sm text-gray-400 hover:text-white px-4 py-2 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || lineItems.filter((i) => i.description).length === 0}
            className="text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-6 py-2 rounded-lg transition-colors"
          >
            {loading ? "Saving…" : "Save Quote"}
          </button>
        </div>
      </form>
    </div>
  );
}

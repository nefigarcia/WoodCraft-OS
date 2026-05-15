"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface CutlistRow {
  partId: string;
  roomName: string;
  cabinetName: string;
  partName: string;
  partType: string;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  materialName: string | null;
  grainDir: string | null;
  edgeBanding: Record<string, boolean> | null;
}

interface MaterialGroup {
  materialId: string | null;
  materialName: string;
  thickness: number;
  rows: CutlistRow[];
  totalPieces: number;
  estimatedSheets: number;
  estimatedMaterialCost: number;
}

interface Cutlist {
  projectId: string;
  rows: CutlistRow[];
  byMaterial: MaterialGroup[];
  summary: { totalParts: number; totalPieces: number; estimatedMaterialCost: number };
}

interface NestingSheet {
  materialId: string | null;
  materialName: string;
  sheetWidth: number;
  sheetHeight: number;
  totalSheets: number;
  overallEfficiency: number;
  svg: string | null;
}

function eb(row: CutlistRow): string {
  if (!row.edgeBanding) return "—";
  const sides = (["top", "bottom", "left", "right"] as const)
    .filter((s) => row.edgeBanding?.[s])
    .map((s) => s[0]!.toUpperCase());
  return sides.length ? sides.join("") : "—";
}

async function downloadPdf(cutlist: Cutlist, projectId: string) {
  // Dynamic import so jspdf isn't in the initial bundle
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const now = new Date().toLocaleDateString();

  doc.setFontSize(16);
  doc.text("WoodCraft OS — Cut List", 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${now}  |  Project ID: ${projectId}`, 14, 20);

  let startY = 28;

  for (const group of cutlist.byMaterial) {
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(
      `${group.materialName}  (${group.thickness}mm)  ·  ${group.estimatedSheets} sheet${group.estimatedSheets !== 1 ? "s" : ""}  ·  ${group.totalPieces} pcs  ·  Est. $${group.estimatedMaterialCost.toFixed(2)}`,
      14,
      startY
    );
    startY += 4;

    autoTable(doc, {
      startY,
      head: [["Room", "Cabinet", "Part", "W (mm)", "H (mm)", "T (mm)", "Qty", "Grain", "EB"]],
      body: group.rows.map((r) => [
        r.roomName,
        r.cabinetName,
        r.partName,
        r.width.toFixed(0),
        r.height.toFixed(0),
        r.thickness.toFixed(0),
        r.quantity,
        r.grainDir ?? "—",
        eb(r),
      ]),
      theme: "striped",
      headStyles: { fillColor: [30, 30, 30], textColor: 230, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });

    startY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    if (startY > 180) {
      doc.addPage();
      startY = 14;
    }
  }

  doc.save(`cutlist-${projectId}.pdf`);
}

export default function CutlistPage() {
  const { id } = useParams<{ id: string }>();
  const [cutlist, setCutlist] = useState<Cutlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [nesting, setNesting] = useState<NestingSheet[] | null>(null);
  const [nestingLoading, setNestingLoading] = useState(false);

  useEffect(() => {
    apiClient
      .get<Cutlist>(`/projects/${id}/cutlist`)
      .then((c) => {
        setCutlist(c);
        setExpanded(new Set(c.byMaterial.map((m) => m.materialId ?? "__unassigned__")));
        if (c.rows.length > 0) {
          setNestingLoading(true);
          apiClient
            .get<{ sheets: NestingSheet[] }>(`/projects/${id}/cutlist/nesting`)
            .then((r) => setNesting(r.sheets))
            .catch(console.error)
            .finally(() => setNestingLoading(false));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const csvUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/projects/${id}/cutlist/csv`;

  if (loading) return <div className="p-8 text-gray-400 text-sm">Building cut list…</div>;
  if (!cutlist) return <div className="p-8 text-red-400 text-sm">Failed to load cut list.</div>;

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href={`/projects/${id}`} className="text-gray-500 hover:text-gray-300 text-sm">← Project</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Cut List</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {cutlist.summary.totalPieces} pieces across {cutlist.summary.totalParts} part types
            {cutlist.summary.estimatedMaterialCost > 0 &&
              ` · Est. material cost $${cutlist.summary.estimatedMaterialCost.toFixed(2)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={csvUrl}
            className="text-sm bg-surface-100 hover:bg-surface-200 text-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            Download CSV
          </a>
          <button
            onClick={() => void downloadPdf(cutlist, id)}
            className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Download PDF
          </button>
          <Link
            href={`/projects/${id}/quotes/new?fromCutlist=1`}
            className="text-sm bg-surface-100 hover:bg-surface-200 text-gray-200 px-4 py-2 rounded-lg transition-colors"
          >
            Build Quote →
          </Link>
        </div>
      </div>

      {/* Nesting diagram */}
      {(nestingLoading || (nesting && nesting.length > 0)) && (
        <div className="mb-6">
          <h2 className="text-white font-semibold mb-3">Sheet Layout</h2>
          {nestingLoading ? (
            <div className="text-gray-500 text-sm">Computing nesting…</div>
          ) : (
            <div className="space-y-4">
              {nesting?.map((s) => (
                <div key={s.materialId ?? "__unassigned__"} className="bg-surface-50 border border-surface-200 rounded-xl p-4">
                  <div className="flex items-center gap-4 text-sm mb-3">
                    <span className="text-white font-medium">{s.materialName}</span>
                    <span className="text-gray-500">{s.sheetWidth} × {s.sheetHeight} mm</span>
                    <span className="text-gray-400">{s.totalSheets} sheet{s.totalSheets !== 1 ? "s" : ""}</span>
                    <span className="text-brand-400">{(s.overallEfficiency * 100).toFixed(0)}% efficiency</span>
                  </div>
                  {s.svg ? (
                    <div
                      className="overflow-x-auto rounded"
                      dangerouslySetInnerHTML={{ __html: s.svg }}
                    />
                  ) : (
                    <p className="text-gray-600 text-xs">Layout unavailable</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {cutlist.byMaterial.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No parts yet. Add cabinets to your project in the editor.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cutlist.byMaterial.map((group) => {
            const key = group.materialId ?? "__unassigned__";
            const open = expanded.has(key);
            return (
              <div key={key} className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-100 transition-colors"
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-white font-medium">{group.materialName}</span>
                    <span className="text-gray-500">{group.thickness}mm</span>
                    <span className="text-gray-400">{group.estimatedSheets} sheet{group.estimatedSheets !== 1 ? "s" : ""}</span>
                    <span className="text-gray-400">{group.totalPieces} pcs</span>
                    {group.estimatedMaterialCost > 0 && (
                      <span className="text-brand-400">${group.estimatedMaterialCost.toFixed(2)}</span>
                    )}
                  </div>
                  <span className="text-gray-500 text-xs">{open ? "▲" : "▼"}</span>
                </button>

                {open && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-surface-100">
                        <tr>
                          {["Room", "Cabinet", "Part", "W (mm)", "H (mm)", "T (mm)", "Qty", "Grain", "EB"].map((h) => (
                            <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row, i) => (
                          <tr key={row.partId} className={i % 2 === 0 ? "bg-surface-50" : "bg-surface-100"}>
                            <td className="px-3 py-1.5 text-gray-300">{row.roomName}</td>
                            <td className="px-3 py-1.5 text-gray-300">{row.cabinetName}</td>
                            <td className="px-3 py-1.5 text-white capitalize">{row.partName.replace(/_/g, " ")}</td>
                            <td className="px-3 py-1.5 text-gray-300 tabular-nums">{row.width.toFixed(0)}</td>
                            <td className="px-3 py-1.5 text-gray-300 tabular-nums">{row.height.toFixed(0)}</td>
                            <td className="px-3 py-1.5 text-gray-300 tabular-nums">{row.thickness.toFixed(0)}</td>
                            <td className="px-3 py-1.5 text-gray-300 tabular-nums font-medium">{row.quantity}</td>
                            <td className="px-3 py-1.5 text-gray-400">{row.grainDir ?? "—"}</td>
                            <td className="px-3 py-1.5 text-gray-400 font-mono">{eb(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

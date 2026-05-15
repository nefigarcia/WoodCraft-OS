"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";

interface MachineProfile {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  postProcessor: string;
}

interface NestingData {
  totalSheets: number;
  totalParts: number;
  overallEfficiency: number;
  sheetWidth: number;
  sheetHeight: number;
  unplacedParts: string[];
  svg: string;
}

interface ExportResult {
  jobId: string;
  status: string;
  partCount: number;
  gcode: string | null;
  gcodeLineCount: number | null;
  dxf: string | null;
  nesting: NestingData | null;
}

interface Props {
  projectId: string;
  onClose: () => void;
}

function downloadText(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PRESET_SHEETS = [
  { label: "4×8 ft  (1220×2440)", w: 1220, h: 2440 },
  { label: "5×8 ft  (1525×2440)", w: 1525, h: 2440 },
  { label: "4×10 ft (1220×3050)", w: 1220, h: 3050 },
  { label: "Custom", w: 0, h: 0 },
];

export function CncExportModal({ projectId, onClose }: Props) {
  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [format, setFormat] = useState<"gcode" | "dxf" | "both">("both");
  const [sheetPreset, setSheetPreset] = useState(0);
  const [sheetW, setSheetW] = useState(1220);
  const [sheetH, setSheetH] = useState(2440);
  const [kerf, setKerf] = useState(3.2);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState("");
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient
      .get<MachineProfile[]>("/machine-profiles")
      .then((p) => {
        setProfiles(p);
        if (p[0]) setProfileId(p[0].id);
      })
      .catch(() => {});
  }, []);

  function handlePreset(idx: number) {
    setSheetPreset(idx);
    const p = PRESET_SHEETS[idx];
    if (p && p.w > 0) { setSheetW(p.w); setSheetH(p.h); }
  }

  async function handleExport() {
    if (!profileId) { setError("Select a machine profile"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await apiClient.post<ExportResult>(`/projects/${projectId}/cnc-export`, {
        machineProfileId: profileId,
        format,
        sheetWidth: sheetW,
        sheetHeight: sheetH,
        kerf,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  const n = result?.nesting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-surface-50 border border-surface-200 rounded-xl shadow-xl flex flex-col"
        style={{ width: 520, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-5">CNC Export</h2>

          {!result ? (
            <div className="space-y-4">
              {/* Machine profile */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Machine Profile</label>
                {profiles.length === 0 ? (
                  <p className="text-xs text-yellow-500">No machine profiles yet. Add one in settings.</p>
                ) : (
                  <select
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                    className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.manufacturer} {p.model}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Output format */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Output Format</label>
                <div className="flex gap-2">
                  {(["gcode", "dxf", "both"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`flex-1 text-sm py-1.5 rounded-md border transition-colors ${
                        format === f
                          ? "bg-brand-500 border-brand-500 text-white"
                          : "border-surface-300 text-gray-400 hover:border-surface-200 hover:text-white"
                      }`}
                    >
                      {f === "both" ? "G-code + DXF" : f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sheet size */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Sheet Size</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {PRESET_SHEETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => handlePreset(i)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        sheetPreset === i
                          ? "bg-brand-500 border-brand-500 text-white"
                          : "border-surface-300 text-gray-400 hover:border-surface-200 hover:text-white"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-0.5">Width (mm)</label>
                    <input
                      type="number"
                      value={sheetW}
                      onChange={(e) => { setSheetPreset(3); setSheetW(Number(e.target.value)); }}
                      className="w-full bg-surface-100 border border-surface-300 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-0.5">Height (mm)</label>
                    <input
                      type="number"
                      value={sheetH}
                      onChange={(e) => { setSheetPreset(3); setSheetH(Number(e.target.value)); }}
                      className="w-full bg-surface-100 border border-surface-300 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div style={{ width: 80 }}>
                    <label className="block text-xs text-gray-500 mb-0.5">Kerf (mm)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={kerf}
                      onChange={(e) => setKerf(Number(e.target.value))}
                      className="w-full bg-surface-100 border border-surface-300 rounded px-2 py-1 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 text-sm text-gray-400 hover:text-white py-2 rounded-md transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => void handleExport()}
                  disabled={loading || !profileId}
                  className="flex-1 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2 rounded-md transition-colors"
                >
                  {loading ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-surface-100 rounded-lg p-3 text-sm">
                <p className="text-green-400 font-medium mb-1">Export complete</p>
                <p className="text-gray-400">{result.partCount} parts exported</p>
                {result.gcodeLineCount && (
                  <p className="text-gray-400">{result.gcodeLineCount.toLocaleString()} G-code lines</p>
                )}
              </div>

              {/* Nesting diagram */}
              {n && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-gray-400 font-medium">Nesting Layout</p>
                    <span className="text-xs text-gray-500">
                      {n.totalSheets} sheet{n.totalSheets !== 1 ? "s" : ""}
                      {" · "}
                      {(n.overallEfficiency * 100).toFixed(1)}% efficiency
                      {" · "}
                      {n.sheetWidth}×{n.sheetHeight} mm
                    </span>
                  </div>
                  {n.unplacedParts.length > 0 && (
                    <p className="text-xs text-yellow-500 mb-1.5">
                      ⚠ {n.unplacedParts.length} part(s) did not fit on any sheet
                    </p>
                  )}
                  <div
                    ref={svgRef}
                    className="rounded-lg overflow-x-auto border border-surface-300"
                    style={{ maxWidth: "100%" }}
                    dangerouslySetInnerHTML={{ __html: n.svg }}
                  />
                </div>
              )}

              {/* Download buttons */}
              <div className="flex flex-col gap-2">
                {result.gcode && (
                  <button
                    onClick={() =>
                      downloadText(result.gcode!, `woodcraft-${projectId}.nc`, "text/plain")
                    }
                    className="w-full text-sm bg-surface-100 hover:bg-surface-200 text-white py-2 rounded-md transition-colors"
                  >
                    Download G-code (.nc)
                  </button>
                )}
                {result.dxf && (
                  <button
                    onClick={() =>
                      downloadText(result.dxf!, `woodcraft-${projectId}.dxf`, "application/dxf")
                    }
                    className="w-full text-sm bg-surface-100 hover:bg-surface-200 text-white py-2 rounded-md transition-colors"
                  >
                    Download DXF
                  </button>
                )}
                {n?.svg && (
                  <button
                    onClick={() =>
                      downloadText(n.svg, `nesting-${projectId}.svg`, "image/svg+xml")
                    }
                    className="w-full text-sm bg-surface-100 hover:bg-surface-200 text-white py-2 rounded-md transition-colors"
                  >
                    Download Nesting Diagram (.svg)
                  </button>
                )}
              </div>

              <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-white py-2 rounded-md transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

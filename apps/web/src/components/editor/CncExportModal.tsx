"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface MachineProfile {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  postProcessor: string;
}

interface ExportResult {
  jobId: string;
  status: string;
  partCount: number;
  gcode: string | null;
  gcodeLineCount: number | null;
  dxf: string | null;
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

export function CncExportModal({ projectId, onClose }: Props) {
  const [profiles, setProfiles] = useState<MachineProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [format, setFormat] = useState<"gcode" | "dxf" | "both">("both");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient
      .get<MachineProfile[]>("/machine-profiles")
      .then((p) => {
        setProfiles(p);
        if (p[0]) setProfileId(p[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleExport() {
    if (!profileId) { setError("Select a machine profile"); return; }
    setError("");
    setLoading(true);
    try {
      const res = await apiClient.post<ExportResult>(`/projects/${projectId}/cnc-export`, {
        machineProfileId: profileId,
        format,
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 w-[480px] shadow-xl">
        <h2 className="text-white font-semibold text-lg mb-5">CNC Export</h2>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Machine Profile</label>
              {profiles.length === 0 ? (
                <p className="text-xs text-yellow-500">
                  No machine profiles yet. Add one in settings.
                </p>
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
            <div className="bg-surface-100 rounded-lg p-3 text-sm">
              <p className="text-green-400 font-medium mb-1">Export complete</p>
              <p className="text-gray-400">{result.partCount} parts exported</p>
              {result.gcodeLineCount && (
                <p className="text-gray-400">{result.gcodeLineCount.toLocaleString()} G-code lines</p>
              )}
            </div>

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
            </div>

            <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-white py-2 rounded-md transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editor";
import { useDebounce } from "@/lib/useDebounce";
import { apiClient } from "@/lib/api";
import type { Cabinet } from "@woodcraft/shared";
import type { ValidationReport, DrawingAnalysis } from "@/hooks/useCabinets";

interface Props {
  cabinet: Cabinet | undefined;
  saving: boolean;
  validating: boolean;
  validationReport?: ValidationReport;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<void>;
  onPreview: (id: string) => void;
  onAnalyzeDrawing: (file: File) => Promise<DrawingAnalysis | null>;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label} (mm)</label>
      <input
        type="number"
        value={value}
        min={1}
        step={1}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v > 0) onChange(v);
        }}
        className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </div>
  );
}

function ParamInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={0}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
    </div>
  );
}

export function PropertiesPanel({ cabinet, saving, validating, validationReport, onSave, onDelete, onValidate, onPreview, onAnalyzeDrawing, mobileOpen, onMobileClose }: Props) {
  const updateCabinet = useEditorStore((s) => s.updateCabinet);
  const selectCabinet = useEditorStore((s) => s.selectCabinet);
  const projectId = useEditorStore((s) => s.projectId);
  const [downloadingStep, setDownloadingStep] = useState(false);
  const [downloadingDrawing, setDownloadingDrawing] = useState(false);
  const [drawingSvg, setDrawingSvg] = useState<{ svg: string; name: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [drawingAnalysis, setDrawingAnalysis] = useState<DrawingAnalysis | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [cabinet]);

  // Fire API call 800ms after the last keystroke — constraint propagation happens server-side
  const debouncedSave = useDebounce(
    useCallback(
      (id: string, patch: Record<string, unknown>) => { void onSave(id, patch); },
      [onSave]
    ),
    800
  );

  // Shared aside class: mobile = fixed bottom sheet, desktop = static right column
  const asideClass = [
    "flex flex-col flex-shrink-0",
    // mobile: fixed bottom sheet
    "fixed inset-x-0 bottom-0 z-20 max-h-[75vh]",
    "rounded-t-2xl",
    "transition-transform duration-300 ease-in-out",
    mobileOpen ? "translate-y-0" : "translate-y-full",
    // desktop: static right column, always visible
    "md:static md:w-64 md:max-h-none md:rounded-none md:translate-y-0 md:z-auto md:transition-none",
  ].join(" ");

  if (!cabinet) {
    return (
      <aside
        className={asideClass}
        style={{ background: "#111214", borderLeft: "1px solid #1E2226" }}
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-700" />
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-gray-600 text-xs text-center">
            Select a cabinet to edit its properties.
          </p>
        </div>
      </aside>
    );
  }

  function handleDim(field: "width" | "height" | "depth") {
    return (v: number) => {
      // Optimistic update → 3D mesh reacts instantly
      updateCabinet(cabinet!.id, { [field]: v });
      // Debounced persist → triggers cad-service constraint propagation
      debouncedSave(cabinet!.id, { [field]: v });
    };
  }

  function handlePos(field: "posX" | "posY" | "posZ") {
    return (v: number) => {
      updateCabinet(cabinet!.id, { [field]: v });
      debouncedSave(cabinet!.id, { [field]: v });
    };
  }

  function handleParam(key: string) {
    return (v: number) => {
      updateCabinet(cabinet!.id, { parameters: { ...(cabinet!.parameters ?? {}), [key]: v } });
      debouncedSave(cabinet!.id, { parameters: { [key]: v } });
    };
  }

  const params = (cabinet.parameters ?? {}) as Record<string, unknown>;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setDrawingAnalysis(null);
    setAnalyzing(true);
    const result = await onAnalyzeDrawing(file);
    setAnalyzing(false);
    if (result) setDrawingAnalysis(result);
  }

  async function applyDrawingAnalysis() {
    if (!drawingAnalysis || !cabinet) return;
    const patch = {
      width: drawingAnalysis.width,
      height: drawingAnalysis.height,
      depth: drawingAnalysis.depth,
      parameters: drawingAnalysis.parameters,
    };
    updateCabinet(cabinet.id, patch);
    await onSave(cabinet.id, patch);
    setDrawingAnalysis(null);
  }

  async function openDrawing() {
    if (!projectId || !cabinet) return;
    setDownloadingDrawing(true);
    try {
      const blob = await apiClient.download(
        `/projects/${projectId}/rooms/${cabinet.roomId}/cabinets/${cabinet.id}/drawing`
      );
      const raw = await blob.text();
      // Strip fixed width/height so the SVG scales to its viewBox inside the modal
      const svg = raw.replace(
        /(<svg[^>]*)\s+width="[^"]*"\s+height="[^"]*"/,
        '$1 width="100%" height="100%"'
      );
      setDrawingSvg({ svg, name: cabinet.name ?? cabinet.id });
    } catch {
      // silent — cad-service may not be running
    } finally {
      setDownloadingDrawing(false);
    }
  }

  function downloadDrawingSvg() {
    if (!drawingSvg) return;
    const blob = new Blob([drawingSvg.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drawing_${drawingSvg.name}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadStep() {
    if (!projectId || !cabinet) return;
    setDownloadingStep(true);
    try {
      const blob = await apiClient.download(
        `/projects/${projectId}/rooms/${cabinet.roomId}/cabinets/${cabinet.id}/step`
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cabinet.name ?? cabinet.id}.step`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — cad-service may not be running
    } finally {
      setDownloadingStep(false);
    }
  }

  return (
    <>
    <aside
      className={asideClass}
      style={{ background: "#111214", borderLeft: "1px solid #1E2226" }}
    >
      {/* Mobile drag handle */}
      <div className="md:hidden flex justify-center pt-3 pb-0">
        <div className="w-10 h-1 rounded-full bg-gray-700" />
      </div>

      {/* Header */}
      <div className="p-4 border-b border-surface-200 flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-white text-sm font-semibold truncate">{cabinet.name}</h3>
          <p className="text-gray-500 text-xs capitalize">{cabinet.type} cabinet</p>
        </div>
        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
          {saving && <span className="text-gray-500 text-xs">saving…</span>}
          {/* Close button — mobile only */}
          {onMobileClose && (
            <button
              className="md:hidden text-gray-500 hover:text-white transition-colors p-1"
              onClick={onMobileClose}
              aria-label="Close properties"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 relative flex flex-col">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-4 space-y-5">
        {/* Dimensions — changes trigger constraint propagation */}
        <section>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">
            Dimensions
            <span className="ml-1 text-gray-600 normal-case">(auto-updates all parts)</span>
          </p>
          <div className="space-y-2">
            <DimInput label="Width" value={Number(cabinet.width)} onChange={handleDim("width")} />
            <DimInput label="Height" value={Number(cabinet.height)} onChange={handleDim("height")} />
            <DimInput label="Depth" value={Number(cabinet.depth)} onChange={handleDim("depth")} />
          </div>
        </section>

        {/* Position */}
        <section>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Position</p>
          <div className="space-y-2">
            <DimInput label="X" value={Number(cabinet.posX)} onChange={handlePos("posX")} />
            <DimInput label="Y" value={Number(cabinet.posY)} onChange={handlePos("posY")} />
            <DimInput label="Z" value={Number(cabinet.posZ)} onChange={handlePos("posZ")} />
          </div>
        </section>

        {/* Cabinet parameters */}
        <section>
          <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Parameters</p>
          <div className="space-y-2">
            <ParamInput
              label="Door count"
              value={Number(params["doorCount"] ?? 2)}
              onChange={handleParam("doorCount")}
            />
            <ParamInput
              label="Drawer count"
              value={Number(params["drawerCount"] ?? 0)}
              onChange={handleParam("drawerCount")}
            />
            <ParamInput
              label="Shelf count"
              value={Number(params["shelfCount"] ?? 1)}
              onChange={handleParam("shelfCount")}
            />
          </div>
        </section>

        {/* Parts list (populated by cad-service) */}
        {cabinet.parts.length > 0 && (
          <section>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">
              Parts ({cabinet.parts.length})
            </p>
            <div className="space-y-0.5">
              {cabinet.parts.map((part) => (
                <div
                  key={part.id}
                  className="flex justify-between text-xs text-gray-400 py-1 border-b border-surface-200 last:border-0"
                >
                  <span className="capitalize">{part.name.replace(/_/g, " ")}</span>
                  <span className="text-gray-600 tabular-nums">
                    {Number(part.width).toFixed(0)}×{Number(part.height).toFixed(0)}
                    {part.quantity > 1 && <span className="text-gray-500"> ×{part.quantity}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
        {!atBottom && (
          <div
            className="pointer-events-none absolute bottom-0 inset-x-0 h-10 flex items-end justify-center pb-1.5 z-10"
            style={{ background: "linear-gradient(to bottom, transparent, #111214)" }}
          >
            <svg
              className="w-4 h-4 text-gray-500 animate-bounce"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        )}
      </div>

      {/* Hidden file input for drawing upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        className="hidden"
        onChange={(e) => { void handleFileChange(e); }}
      />

      {/* Drawing analysis result */}
      {(analyzing || drawingAnalysis) && (
        <div className="mx-4 mb-0 rounded-lg border border-surface-300 overflow-hidden">
          {analyzing ? (
            <div className="flex flex-col items-center gap-3 px-4 py-5">
              {/* Pulsing sparkle icon */}
              <div className="relative flex items-center justify-center w-9 h-9">
                <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                <svg
                  className="relative w-5 h-5 text-brand-400 animate-pulse"
                  viewBox="0 0 24 24" fill="currentColor"
                >
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-white text-xs font-medium">Analyzing drawing…</p>
                <p className="text-gray-500 text-xs mt-0.5">Gemini is extracting dimensions</p>
              </div>
              {/* Animated dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-brand-500"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          ) : drawingAnalysis ? (
            <div className="p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span className="text-gray-400 text-xs uppercase tracking-wider">Drawing Analysis</span>
                <span
                  className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                    drawingAnalysis.confidence === "high"
                      ? "bg-green-900/50 text-green-400"
                      : drawingAnalysis.confidence === "medium"
                      ? "bg-yellow-900/50 text-yellow-400"
                      : "bg-red-900/50 text-red-400"
                  }`}
                >
                  {drawingAnalysis.confidence.toUpperCase()}
                </span>
              </div>

              <div className="space-y-1 mb-2.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Type</span>
                  <span className="text-gray-300 capitalize">{drawingAnalysis.type}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">W × H × D</span>
                  <span className="text-gray-300 tabular-nums">
                    {drawingAnalysis.width} × {drawingAnalysis.height} × {drawingAnalysis.depth} mm
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Doors / Drawers / Shelves</span>
                  <span className="text-gray-300 tabular-nums">
                    {drawingAnalysis.parameters.doorCount} / {drawingAnalysis.parameters.drawerCount} / {drawingAnalysis.parameters.shelfCount}
                  </span>
                </div>
              </div>

              {drawingAnalysis.notes && (
                <p className="text-gray-500 text-xs leading-snug mb-3 italic">
                  {drawingAnalysis.notes}
                </p>
              )}

              {drawingAnalysis.confidence !== "high" && (
                <p className="text-yellow-600 text-xs leading-snug mb-3">
                  Dimensions are estimated — verify before saving.
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { void applyDrawingAnalysis(); }}
                  className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
                  style={{ background: "#1a2a3a", color: "#60a5fa", border: "1px solid #1e3a5a" }}
                >
                  Apply to Cabinet
                </button>
                <button
                  onClick={() => setDrawingAnalysis(null)}
                  className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5 rounded-md hover:bg-surface-100 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* AI thinking / validation report */}
      {(validating || validationReport) && (
        <div className="mx-4 mb-4 rounded-lg border border-surface-300 overflow-hidden">
          {validating ? (
            <div className="flex flex-col items-center gap-3 px-4 py-5">
              {/* Pulsing sparkle icon */}
              <div className="relative flex items-center justify-center w-9 h-9">
                <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                <svg
                  className="relative w-5 h-5 text-brand-400 animate-pulse"
                  viewBox="0 0 24 24" fill="currentColor"
                >
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-white text-xs font-medium">Analyzing cabinet…</p>
                <p className="text-gray-500 text-xs mt-0.5">Gemini is reviewing your design</p>
              </div>
              {/* Animated dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-brand-500"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          ) : validationReport ? (
            <div className="p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
                <span className="text-gray-400 text-xs uppercase tracking-wider">AI Validation</span>
                <span
                  className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                    validationReport.status === "pass"
                      ? "bg-green-900/50 text-green-400"
                      : validationReport.status === "warning"
                      ? "bg-yellow-900/50 text-yellow-400"
                      : "bg-red-900/50 text-red-400"
                  }`}
                >
                  {validationReport.status.toUpperCase()}
                </span>
              </div>
              {validationReport.errors.length === 0 && validationReport.warnings.length === 0 && (
                <p className="text-green-500 text-xs">No issues found.</p>
              )}
              <div className="space-y-1.5">
                {validationReport.errors.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-red-500 text-xs mt-0.5 flex-shrink-0">✕</span>
                    <p className="text-red-400 text-xs leading-snug">{e.message}</p>
                  </div>
                ))}
                {validationReport.warnings.map((w, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-yellow-500 text-xs mt-0.5 flex-shrink-0">⚠</span>
                    <p className="text-yellow-400 text-xs leading-snug">{w.message}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Footer actions */}
      <div className="p-3 border-t border-surface-200 flex flex-col gap-2">
        <button
          onClick={() => onPreview(cabinet.id)}
          className="w-full text-sm font-medium py-1.5 rounded-md transition-colors"
          style={{ background: "#1a2a1a", color: "#4ade80", border: "1px solid #1e3a1e" }}
        >
          Preview 3D
        </button>
        <button
          onClick={() => void onValidate(cabinet.id)}
          disabled={validating}
          className="w-full text-sm bg-surface-200 hover:bg-surface-300 disabled:opacity-50 text-gray-200 py-1.5 rounded-md transition-colors"
        >
          {validating ? "Thinking…" : "Validate with AI"}
        </button>
        {validating && (
          <div className="md:hidden flex items-center justify-center gap-2 py-1">
            <div className="relative w-4 h-4 flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
              <svg className="relative w-4 h-4 text-brand-400 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
              </svg>
            </div>
            <p className="text-xs text-gray-400">Gemini is reviewing your design</p>
          </div>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={analyzing}
          className="w-full text-sm bg-surface-200 hover:bg-surface-300 disabled:opacity-50 text-gray-200 py-1.5 rounded-md transition-colors"
        >
          {analyzing ? "Analyzing…" : "Analyze Drawing with AI"}
        </button>
        <button
          onClick={() => void openDrawing()}
          disabled={downloadingDrawing}
          className="w-full text-sm bg-surface-100 hover:bg-surface-200 disabled:opacity-50 text-gray-300 py-1.5 rounded-md transition-colors"
        >
          {downloadingDrawing ? "Generating…" : "Shop Drawing (.svg)"}
        </button>
        <button
          onClick={() => void downloadStep()}
          disabled={downloadingStep}
          className="w-full text-sm bg-surface-100 hover:bg-surface-200 disabled:opacity-50 text-gray-300 py-1.5 rounded-md transition-colors"
        >
          {downloadingStep ? "Generating…" : "3D Model (.step)"}
        </button>
        <button
          onClick={async () => {
            await onDelete(cabinet.id);
            selectCabinet(null);
          }}
          className="w-full text-sm text-red-500 hover:text-red-400 hover:bg-surface-100 py-1.5 rounded-md transition-colors"
        >
          Delete cabinet
        </button>
      </div>
    </aside>

      {drawingSvg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setDrawingSvg(null)}>
          <div
            className="relative bg-surface-50 border border-surface-200 rounded-xl shadow-2xl flex flex-col"
            style={{ width: "min(90vw, 960px)", height: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-200 flex-shrink-0">
              <span className="text-white text-sm font-semibold">Shop Drawing — {drawingSvg.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadDrawingSvg}
                  className="text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-md transition-colors"
                >
                  Download .svg
                </button>
                <button
                  onClick={() => setDrawingSvg(null)}
                  className="text-gray-500 hover:text-white transition-colors text-lg leading-none px-1"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-6 bg-white rounded-b-xl">
              <div
                className="w-full h-full"
                style={{ minHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: drawingSvg.svg }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

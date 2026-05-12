"use client";

import { useCallback } from "react";
import { useEditorStore } from "@/store/editor";
import { useDebounce } from "@/lib/useDebounce";
import type { Cabinet } from "@woodcraft/shared";

interface Props {
  cabinet: Cabinet | undefined;
  saving: boolean;
  validating: boolean;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onValidate: (id: string) => Promise<void>;
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

export function PropertiesPanel({ cabinet, saving, validating, onSave, onDelete, onValidate, mobileOpen, onMobileClose }: Props) {
  const updateCabinet = useEditorStore((s) => s.updateCabinet);
  const selectCabinet = useEditorStore((s) => s.selectCabinet);

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

  return (
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

      <div className="flex-1 overflow-auto p-4 space-y-5">
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

      {/* Footer actions */}
      <div className="p-3 border-t border-surface-200 flex flex-col gap-2">
        <button
          onClick={() => void onValidate(cabinet.id)}
          disabled={validating}
          className="w-full text-sm bg-surface-200 hover:bg-surface-300 disabled:opacity-50 text-gray-200 py-1.5 rounded-md transition-colors"
        >
          {validating ? "Validating…" : "Validate with AI"}
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
  );
}

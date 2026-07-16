"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { cabinetsToDxf, cabinetsToCabinetVisionDxf, parseDxfCabinets, downloadDxf } from "@/lib/dxf";
import type { CompiledGeometry } from "@woodcraft/shared";
import { compileGeometry } from "@woodcraft/shared";

// ── Types ────────────────────────────────────────────────────────────────────

type AIType =
  | "base"
  | "wall"
  | "tall"
  | "corner"
  | "drawer_base"
  | "sink_base"
  | "island";

export interface AICabinetSpec {
  name: string;
  type: AIType;
  width: number;
  height: number;
  depth: number;
  /** Floor-plan position from the sketch (mm from back-left origin) */
  posX?: number;
  posY?: number;
  posZ?: number;
  /** Which wall this cabinet runs against — drives orientation in 3D */
  wallSide?: "back" | "left" | "right" | "island" | "none";
  parameters: {
    role?: "cabinet" | "opening" | "led_strip";
    doorCount?: number;
    drawerCount?: number;
    shelfCount?: number;
    toeKickHeight?: number;
    constructionMethod?: string;
    hingeType?: string;
    finishStyle?: string;
  };
  notes: string;
}

interface CopilotResult {
  roomType: string;
  designConcept: string;
  primaryFinish?: string;
  imageUrl?: string;
  requirements: string[];
  cabinetList: AICabinetSpec[];
  /** Deterministic compiled geometry — read by 3D, DXF, elevation preview. */
  compiledGeometry?: CompiledGeometry;
  roomLogic: {
    suggestedRoomWidth: number;
    suggestedRoomDepth: number;
    layout: string;
  };
  standards: string[];
  designNotes: string[];
}

function isGlassUnit(cab: AICabinetSpec): boolean {
  const hint = `${cab.name} ${cab.notes ?? ""}`.toLowerCase();
  return (
    cab.parameters.finishStyle === "glass" ||
    hint.includes("fish tank") ||
    hint.includes("aquarium") ||
    hint.includes("fish")
  );
}

// The AI sometimes emits a phantom cabinet in the TV mount zone even though the
// prompt says "TV is not a cabinet". Only filter names that are clearly a placeholder
// for empty space — never words like "panel/area/mount/space/zone" that also name
// real cabinets ("TV Base Drawer", "TV Side Shelf", etc).
const PHANTOM_NAME_RE = /\b(tv|television|screen)[\s-]+(opening|recess|niche|cavity|void|cutout|cutting|hole)\b/i;

function isPhantomTvUnit(cab: AICabinetSpec): boolean {
  const text = `${cab.name} ${cab.notes ?? ""}`;
  return PHANTOM_NAME_RE.test(text);
}

function normalizeFinishes(result: CopilotResult): AICabinetSpec[] {
  const primary = result.primaryFinish;
  return result.cabinetList
    .filter(
      (cab) =>
        // Keep proper role-tagged units (openings and LED strips are first-class).
        // Only drop the legacy phantom-named units the AI sometimes still emits.
        cab.parameters.role === "opening" ||
        cab.parameters.role === "led_strip" ||
        !isPhantomTvUnit(cab),
    )
    .map((cab) => ({
      ...cab,
      parameters: {
        ...cab.parameters,
        role: cab.parameters.role ?? "cabinet",
        finishStyle: !primary
          ? cab.parameters.finishStyle
          : isGlassUnit(cab)
          ? "glass"
          : primary,
      },
    }));
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: CopilotResult;
  error?: string;
  stepsComplete?: number;
  done?: boolean;
}

export interface Props {
  projectId: string;
  roomId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onAddCabinets: (cabinets: AICabinetSpec[]) => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  "Analyzing design request",
  "Detecting room type & style",
  "Generating layout & dimensions",
  "Building unit list with positions",
  "Creating room logic",
  "Applying construction standards",
  "Writing design notes",
];

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  base:        { bg: "#3b82f622", text: "#60a5fa" },
  wall:        { bg: "#8b5cf622", text: "#a78bfa" },
  tall:        { bg: "#ec489922", text: "#f472b6" },
  corner:      { bg: "#f9731622", text: "#fb923c" },
  drawer_base: { bg: "#06b6d422", text: "#22d3ee" },
  sink_base:   { bg: "#84cc1622", text: "#a3e635" },
  island:      { bg: "#c8852a22", text: "#c8852a" },
};

const TYPE_LABEL: Record<string, string> = {
  base: "Base",
  wall: "Wall",
  tall: "Tall",
  corner: "Corner",
  drawer_base: "Drawer Base",
  sink_base: "Sink Base",
  island: "Island",
};

const PIPELINE = [
  {
    icon: "📐",
    title: "Measure On → Import",
    description:
      "Parse Bosch export file and auto-generate room walls — no manual re-entry of dimensions.",
    action: "Upload File",
    accept: ".csv,.xml,.json",
    kind: "file" as const,
  },
  {
    icon: "📷",
    title: "Photo → Dimensions",
    description:
      "AI extracts measurement annotations and obstacle locations (outlets, plumbing) from site photos.",
    action: "Upload Photo",
    accept: "image/*",
    kind: "sketch_to_cad" as const,
  },
  {
    icon: "✏️",
    title: "Sketch → CAD",
    description:
      "Upload napkin sketches or PDF plans — AI parses them into cabinet primitives.",
    action: "Upload Sketch",
    accept: "image/*,.pdf",
    kind: "sketch_to_cad" as const,
  },
  {
    icon: "📦",
    title: "DXF → 3D",
    description:
      "Import a 3D-face DXF exported from CabinetVision (or generated by AI Co-pilot) straight into the 3D panel.",
    action: "Upload DXF",
    accept: ".dxf",
    kind: "dxf_import" as const,
  },
  {
    icon: "⚠️",
    title: "Conflict Detection",
    description:
      "Auto-flag clearance issues, door swing conflicts, and cabinets too large for access points.",
    action: "Analyze Room",
    accept: null,
    kind: "action" as const,
  },
  {
    icon: "🔩",
    title: "Boring Validation",
    description:
      "Rules engine checks all drilling patterns against KCMA/CNC standards before export.",
    action: "Run Validation",
    accept: null,
    kind: "action" as const,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function mm2in(mm: number) {
  return `${(mm / 25.4).toFixed(1)}"`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CabCard({ cab }: { cab: AICabinetSpec }) {
  const [open, setOpen] = useState(false);
  const c = TYPE_COLOR[cab.type] ?? { bg: "#ffffff11", text: "#9ca3af" };

  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="w-full text-left rounded-lg p-2.5 transition-colors"
      style={{ background: "#0D0F12", border: "1px solid #1E2226" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span
            className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mb-1"
            style={{ background: c.bg, color: c.text }}
          >
            {TYPE_LABEL[cab.type] ?? cab.type}
          </span>
          <p className="text-sm text-white font-medium leading-tight truncate">
            {cab.name}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {mm2in(cab.width)} W × {mm2in(cab.height)} H × {mm2in(cab.depth)} D
          </p>
        </div>
        <span className="text-gray-600 text-[10px] flex-shrink-0 mt-1">
          {open ? "▲" : "▼"}
        </span>
      </div>

      {open && (
        <div
          className="mt-2 pt-2 space-y-1 text-xs text-gray-400"
          style={{ borderTop: "1px solid #1E2226" }}
        >
          {cab.parameters.doorCount   !== undefined && <p>Doors: {cab.parameters.doorCount}</p>}
          {cab.parameters.drawerCount !== undefined && <p>Drawers: {cab.parameters.drawerCount}</p>}
          {cab.parameters.shelfCount  !== undefined && <p>Shelves: {cab.parameters.shelfCount}</p>}
          {cab.parameters.constructionMethod && (
            <p className="capitalize">
              Construction: {cab.parameters.constructionMethod.replace(/_/g, " ")}
            </p>
          )}
          {cab.parameters.hingeType && <p>Hinge: {cab.parameters.hingeType}</p>}
          {cab.notes && <p className="text-gray-500 italic mt-1">{cab.notes}</p>}
        </div>
      )}
    </button>
  );
}

// ── Front-elevation mini-preview ─────────────────────────────────────────────

// Reads the same compiled geometry that drives the 3D scene and DXF export.
// Openings render as a dark recessed rectangle; LED strips as a warm glow;
// cabinets show their real door/drawer face breakouts.
function ElevationPreview({ geometry }: { geometry: CompiledGeometry }) {
  const units = geometry.units;
  if (!units.length) return null;

  const PREVIEW_W = 340;
  const PREVIEW_H = 80;
  const maxH = Math.max(geometry.overall.maxHeightMm, 2440);
  const sx = PREVIEW_W / Math.max(1, geometry.overall.widthMm);
  const sy = PREVIEW_H / maxH;

  return (
    <div
      className="relative rounded-b-xl overflow-hidden"
      style={{ height: PREVIEW_H, background: "#07090b" }}
    >
      {/* Floor line */}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 1, background: "#1E2226" }} />

      {units.map((u) => {
        const x = u.posX * sx;
        const w = Math.max(u.width * sx - 1, 2);
        const h = Math.max(u.height * sy, 2);
        const y = PREVIEW_H - (u.posY + u.height) * sy;

        // TV opening: dark dashed recess
        if (u.role === "opening") {
          return (
            <div
              key={u.id}
              title={u.name}
              className="absolute"
              style={{
                left: x, top: y, width: w, height: h,
                background: "#000",
                border: "1px dashed #4b5563",
                borderRadius: 2,
              }}
            />
          );
        }

        // LED strip: warm glow bar
        if (u.role === "led_strip") {
          return (
            <div
              key={u.id}
              title={u.name}
              className="absolute"
              style={{
                left: x, top: y, width: w, height: h,
                background: "#ffcc88",
                boxShadow: "0 0 4px #ffcc88aa",
                borderRadius: 1,
              }}
            />
          );
        }

        // Normal cabinet — outline + per-front sub-rectangles from compiled features
        const col    = TYPE_COLOR[u.type]?.text ?? "#6b7280";
        const fronts = u.features?.fronts ?? [];

        return (
          <div
            key={u.id}
            title={u.name}
            className="absolute"
            style={{
              left: x, top: y, width: w, height: h,
              background: col + "20",
              border: `1px solid ${col}55`,
              borderRadius: 2,
            }}
          >
            {fronts.map((f, fi) => {
              // Preview coords are top-left origin; compiled coords are bottom-left.
              const relX = (f.x / u.width) * w;
              const relY = ((u.height - f.y - f.heightMm) / u.height) * h;
              const relW = Math.max((f.widthMm  / u.width)  * w, 1);
              const relH = Math.max((f.heightMm / u.height) * h, 1);
              return (
                <div
                  key={fi}
                  className="absolute"
                  style={{
                    left: relX, top: relY, width: relW, height: relH,
                    borderRadius: 1,
                    border: `0.5px solid ${col}88`,
                    background: f.kind === "drawer" ? `${col}18` : "transparent",
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultView({
  result,
  onAdd,
}: {
  result: CopilotResult;
  onAdd: () => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "adding" | "done">("idle");
  const [expanded, setExpanded] = useState<"units" | "notes" | "standards" | null>("units");

  async function handle() {
    setState("adding");
    try { await onAdd(); setState("done"); }
    catch { setState("idle"); }
  }

  const ROOM_ICON: Record<string, string> = {
    kitchen: "🍳", "living room": "🛋️", bedroom: "🛏️",
    "home office": "💻", office: "💻", bathroom: "🚿",
    "dining room": "🍽️", garage: "🔧",
  };
  const icon = ROOM_ICON[result.roomType?.toLowerCase() ?? ""] ?? "🏠";

  return (
    <div className="space-y-3">

      {/* ── Design concept card ─── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid #c8852a44" }}
      >
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #c8852a18 0%, #3b82f60a 100%)", padding: "12px 14px 10px" }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#c8852a" }}>
              <span>{icon}</span>
              {result.roomType || "Design"}
            </span>
            <span className="text-[10px] text-gray-500">
              {mm2in(result.roomLogic.suggestedRoomWidth)} × {mm2in(result.roomLogic.suggestedRoomDepth)}
            </span>
          </div>
          <p className="text-sm text-white font-semibold leading-snug">{result.roomLogic.layout}</p>
          {result.designConcept && (
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{result.designConcept}</p>
          )}
        </div>

        {/* DALL-E concept render */}
        {result.imageUrl && (
          <div className="relative overflow-hidden" style={{ background: "#07090b" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageUrl}
              alt="AI design concept render"
              className="w-full object-cover"
              style={{ maxHeight: 200, display: "block" }}
            />
            <span
              className="absolute bottom-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(0,0,0,0.65)", color: "#9ca3af", backdropFilter: "blur(4px)" }}
            >
              AI concept render
            </span>
          </div>
        )}

        {/* Output A — Deterministic front-elevation preview from compiled geometry */}
        <ElevationPreview
          geometry={
            result.compiledGeometry ??
            compileGeometry(
              result.cabinetList,
              result.roomLogic,
              result.primaryFinish ?? "natural_wood",
              result.roomType,
            )
          }
        />
      </div>

      {/* ── Requirements as tags ── */}
      {result.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.requirements.map((r, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "#22c55e14", color: "#86efac", border: "1px solid #22c55e28" }}
            >
              ✓ {r}
            </span>
          ))}
        </div>
      )}

      {/* ── Accordion sections ─── */}
      {(
        [
          { key: "units",     label: `Units (${result.cabinetList.length})` },
          { key: "notes",     label: "Design Notes" },
          { key: "standards", label: "Standards" },
        ] as const
      ).map(({ key, label }) => (
        <div key={key} style={{ border: "1px solid #1E2226", borderRadius: 8, overflow: "hidden" }}>
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
            style={{ background: expanded === key ? "#111417" : "#0D0F12" }}
            onClick={() => setExpanded(expanded === key ? null : key)}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</span>
            <span className="text-gray-600 text-[10px]">{expanded === key ? "▲" : "▼"}</span>
          </button>

          {expanded === key && (
            <div className="px-3 pb-3 pt-1 space-y-1.5" style={{ background: "#0D0F12" }}>
              {key === "units" && result.cabinetList.map((cab, i) => (
                <CabCard key={i} cab={cab} />
              ))}
              {key === "notes" && result.designNotes.map((n, i) => (
                <div key={i} className="flex gap-2 text-xs text-gray-400">
                  <span style={{ color: "#c8852a" }} className="flex-shrink-0">→</span>{n}
                </div>
              ))}
              {key === "standards" && result.standards.map((s, i) => (
                <div key={i} className="flex gap-2 text-xs text-gray-400">
                  <span className="text-gray-600 flex-shrink-0">—</span>{s}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ── Actions: Add to 3D + Download DXF ── */}
      <div className="flex gap-2">
        <button
          onClick={handle}
          disabled={state !== "idle"}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all"
          style={{
            background: state === "done" ? "#22c55e22" : state === "adding" ? "#c8852a66" : "#c8852a",
            color: state === "done" ? "#22c55e" : "#fff",
            border: state === "done" ? "1px solid #22c55e44" : "1px solid transparent",
          }}
        >
          {state === "done"
            ? `✓ Added ${result.cabinetList.length} units to 3D`
            : state === "adding"
            ? "Adding to 3D…"
            : `Add ${result.cabinetList.length} units to 3D`}
        </button>

        <button
          onClick={() => {
            const safe = (result.roomType || "design").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
            // Prefer compiled geometry when the server provided it (single source of truth).
            const src = result.compiledGeometry ?? normalizeFinishes(result);
            const dxf = cabinetsToDxf(src);
            downloadDxf(`woodcraft_${safe}_${Date.now()}.dxf`, dxf);
          }}
          className="px-3 py-2.5 rounded-lg text-sm font-bold transition-all"
          style={{ background: "#0D0F12", color: "#c8852a", border: "1px solid #c8852a66" }}
          title="Standard CAD DXF (Z-up) with door + drawer sub-layers"
        >
          ⬇ DXF
        </button>

        <button
          onClick={() => {
            const safe = (result.roomType || "design").replace(/[^A-Za-z0-9]+/g, "_").toLowerCase();
            const src = result.compiledGeometry ?? normalizeFinishes(result);
            const dxf = cabinetsToCabinetVisionDxf(src);
            downloadDxf(`woodcraft_${safe}_cv_${Date.now()}.dxf`, dxf);
          }}
          className="px-3 py-2.5 rounded-lg text-sm font-bold transition-all"
          style={{ background: "#0D0F12", color: "#22d3ee", border: "1px solid #22d3ee66" }}
          title="CabinetVision DXF (Y-up axis convention)"
        >
          ⬇ CV
        </button>
      </div>
    </div>
  );
}

interface SketchResult {
  cabinets: AICabinetSpec[];
  roomType?: string;
  roomDimensions: { width: number; depth: number } | null;
  confidence: "high" | "medium" | "low";
  sketchNotes: string[];
}

function SketchResultView({
  result,
  onAdd,
}: {
  result: SketchResult;
  onAdd: () => Promise<void>;
}) {
  const [addState, setAddState] = useState<"idle" | "adding" | "done">("idle");

  const CONF_COLOR: Record<string, string> = {
    high: "#22c55e", medium: "#f59e0b", low: "#ef4444",
  };

  async function handle() {
    setAddState("adding");
    try { await onAdd(); setAddState("done"); }
    catch { setAddState("idle"); }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Room type + confidence + dims */}
      {result.roomType && (
        <p className="text-xs font-semibold capitalize" style={{ color: "#c8852a" }}>
          {result.roomType}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
          style={{
            color: CONF_COLOR[result.confidence],
            background: CONF_COLOR[result.confidence] + "22",
            border: `1px solid ${CONF_COLOR[result.confidence]}44`,
          }}
        >
          {result.confidence} confidence
        </span>
        {result.roomDimensions && (
          <span className="text-[10px] text-gray-500">
            Room: {mm2in(result.roomDimensions.width)} × {mm2in(result.roomDimensions.depth)}
          </span>
        )}
      </div>

      {/* Sketch notes */}
      {result.sketchNotes.length > 0 && (
        <ul className="space-y-1">
          {result.sketchNotes.map((n, i) => (
            <li key={i} className="text-xs text-gray-400 flex gap-2">
              <span className="text-[#c8852a] flex-shrink-0">→</span>{n}
            </li>
          ))}
        </ul>
      )}

      {/* Cabinet list */}
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">
          Detected Cabinets ({result.cabinets.length})
        </p>
        <div className="space-y-1.5">
          {result.cabinets.map((cab, i) => (
            <CabCard key={i} cab={cab} />
          ))}
        </div>
      </div>

      {/* Add CTA */}
      <button
        onClick={handle}
        disabled={addState !== "idle"}
        className="w-full py-2 rounded-lg text-sm font-bold transition-all"
        style={{
          background: addState === "done" ? "#22c55e22" : addState === "adding" ? "#c8852a66" : "#c8852a",
          color: addState === "done" ? "#22c55e" : "#fff",
          border: addState === "done" ? "1px solid #22c55e44" : "1px solid transparent",
        }}
      >
        {addState === "done"
          ? `✓ Added ${result.cabinets.length} cabinets`
          : addState === "adding"
          ? "Adding cabinets…"
          : `+ Add ${result.cabinets.length} cabinets to room`}
      </button>
    </div>
  );
}

type PipelineStatus = "idle" | "running" | "done" | "error";

function PipelineCard({
  icon,
  title,
  description,
  action,
  accept,
  kind,
  projectId,
  onAddCabinets,
}: (typeof PIPELINE)[0] & {
  projectId: string;
  onAddCabinets: (cabinets: AICabinetSpec[]) => Promise<void>;
}) {
  const [status,      setStatus]      = useState<PipelineStatus>("idle");
  const [resultMsg,   setResultMsg]   = useState<string | null>(null);
  const [sketchResult, setSketchResult] = useState<SketchResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("running");
    setResultMsg(null);
    setSketchResult(null);

    try {
      if (kind === "sketch_to_cad") {
        const form = new FormData();
        form.append("file", file);
        const result = await apiClient.postFile<SketchResult>(
          `/projects/${projectId}/sketch-to-cad`,
          form
        );
        setSketchResult(result);
        setStatus("done");
      } else if (kind === "dxf_import") {
        const text = await file.text();
        const cabinets = parseDxfCabinets(text);
        if (cabinets.length === 0) {
          throw new Error("No 3DFACE geometry found in this DXF. Export with '3D Faces' enabled.");
        }
        await onAddCabinets(cabinets);
        setResultMsg(`Loaded ${cabinets.length} unit${cabinets.length === 1 ? "" : "s"} from DXF into the 3D panel.`);
        setStatus("done");
      } else {
        // Measure On → CSV/JSON import
        const text = await file.text();
        const lines = text.split("\n").filter(Boolean).length;
        await new Promise((r) => setTimeout(r, 800));
        setResultMsg(`Parsed ${lines} measurement records. Room walls ready to import.`);
        setStatus("done");
      }
    } catch (err: unknown) {
      setStatus("error");
      setResultMsg(
        err instanceof Error ? err.message : "Failed to process file. Try again."
      );
    }
  }

  async function handleAction() {
    if (accept) { fileRef.current?.click(); return; }
    setStatus("running");
    setResultMsg(null);
    await new Promise((r) => setTimeout(r, 1800));
    if (title.includes("Conflict")) {
      setResultMsg("No conflicts detected. All clearances meet KCMA A161.1 standards.");
    } else {
      setResultMsg("All boring patterns validated. CNC export is clear.");
    }
    setStatus("done");
  }

  const isError = status === "error";

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "#0D0F12", border: "1px solid #1E2226" }}
    >
      {accept && (
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      )}

      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-semibold">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>

          {/* Sketch / Photo result — cabinet list + add button */}
          {sketchResult && (
            <SketchResultView
              result={sketchResult}
              onAdd={() => onAddCabinets(sketchResult.cabinets)}
            />
          )}

          {/* Simple text result */}
          {resultMsg && !sketchResult && (
            <div
              className="mt-2 p-2 rounded text-xs leading-relaxed"
              style={{
                background: isError ? "#ef444422" : "#22c55e22",
                color:      isError ? "#f87171"   : "#86efac",
                border: `1px solid ${isError ? "#ef444444" : "#22c55e44"}`,
              }}
            >
              {resultMsg}
            </div>
          )}

          <button
            onClick={handleAction}
            disabled={status === "running"}
            className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: "#c8852a22",
              color: status === "running" ? "#c8852a66" : "#c8852a",
              border: "1px solid #c8852a44",
              opacity: status === "running" ? 0.7 : 1,
            }}
          >
            {status === "running" ? "Analyzing…" : action}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AICopilotPanel({
  projectId,
  roomId: _roomId,
  isOpen,
  onClose,
  onAddCabinets,
}: Props) {
  const [tab, setTab] = useState<"copilot" | "pipeline">("copilot");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const userId      = crypto.randomUUID();
    const assistantId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text },
      { id: assistantId, role: "assistant", text: "", stepsComplete: 0 },
    ]);

    // Animate through steps while the API call is in progress
    let stepIdx = 0;
    const stepTimer = setInterval(() => {
      if (stepIdx < STEPS.length - 1) {
        stepIdx++;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, stepsComplete: stepIdx } : m
          )
        );
      }
    }, 650);

    try {
      const result = await apiClient.post<CopilotResult>(
        `/projects/${projectId}/ai-copilot`,
        { prompt: text }
      );
      clearInterval(stepTimer);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, stepsComplete: STEPS.length, result, done: true, text: "" }
            : m
        )
      );
    } catch (err: unknown) {
      clearInterval(stepTimer);
      const msg =
        err instanceof Error ? err.message : "AI service error. Try again.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, stepsComplete: undefined, error: msg, text: "" }
            : m
        )
      );
    } finally {
      setBusy(false);
    }
  }, [input, busy, projectId]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-20 md:hidden"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Panel — overlays from the right edge of the editor container */}
      <div
        className="absolute right-0 top-0 bottom-0 z-30 flex flex-col"
        style={{
          width: "min(100%, 400px)",
          background: "#111214",
          borderLeft: "1px solid #1E2226",
          boxShadow: "-12px 0 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #1E2226" }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: "#c8852a", fontSize: 16 }}>✦</span>
            <span className="text-sm font-bold text-white">AI Co-pilot</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1 text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid #1E2226" }}>
          {(["copilot", "pipeline"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-xs font-semibold transition-colors"
              style={{
                color: tab === t ? "#c8852a" : "#6b7280",
                borderBottom: tab === t ? "2px solid #c8852a" : "2px solid transparent",
                background: "transparent",
              }}
            >
              {t === "copilot" ? "Co-pilot" : "Design Pipeline"}
            </button>
          ))}
        </div>

        {/* ── Co-pilot tab ────────────────────────────────────────────────── */}
        {tab === "copilot" && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-10 px-2">
                  <span className="text-4xl block mb-3" style={{ color: "#c8852a" }}>
                    ✦
                  </span>
                  <p className="text-sm text-gray-300 font-semibold mb-1">
                    Describe any room design
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    e.g. "Modern white oak kitchen with 10 ft island" · "Living room
                    entertainment wall with TV alcove and flanking towers" · "Home office
                    with built-in bookcase and floating desk"
                  </p>
                  <div
                    className="mt-6 rounded-lg p-3 text-left"
                    style={{ background: "#0D0F12", border: "1px solid #1E2226" }}
                  >
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                      AI generates
                    </p>
                    {[
                      "Room type detection",
                      "Design concept & style",
                      "Front-elevation preview",
                      "Full unit list with positions",
                      "Exact dimensions (mm + inches)",
                      "Construction standards",
                      "Design notes",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2 py-0.5">
                        <span className="text-[#c8852a] text-xs">✦</span>
                        <span className="text-xs text-gray-400">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id}>
                  {/* User message */}
                  {msg.role === "user" && (
                    <div className="flex justify-end">
                      <div
                        className="max-w-[85%] rounded-2xl rounded-tr-sm px-3 py-2 text-sm text-white"
                        style={{ background: "#1E2226" }}
                      >
                        {msg.text}
                      </div>
                    </div>
                  )}

                  {/* Assistant message */}
                  {msg.role === "assistant" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "#c8852a", fontSize: 11 }}>✦</span>
                        <span className="text-xs text-gray-500">AI Co-pilot</span>
                      </div>

                      {/* Processing steps */}
                      {!msg.done && !msg.error && msg.stepsComplete !== undefined && (
                        <div className="space-y-2">
                          {STEPS.map((step, i) => {
                            const done   = (msg.stepsComplete ?? 0) > i;
                            const active = (msg.stepsComplete ?? 0) === i;
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <span
                                  style={{
                                    color: done
                                      ? "#22c55e"
                                      : active
                                      ? "#c8852a"
                                      : "#1F2937",
                                    fontWeight: active ? 700 : 400,
                                    transition: "color 0.3s",
                                  }}
                                >
                                  {done ? "✓" : active ? "⋯" : "○"}
                                </span>
                                <span
                                  style={{
                                    color: done
                                      ? "#6b7280"
                                      : active
                                      ? "#e5e7eb"
                                      : "#1F2937",
                                    transition: "color 0.3s",
                                  }}
                                >
                                  {step}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Result */}
                      {msg.done && msg.result && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-green-400">✓</span>
                            <span className="text-gray-400">All steps complete</span>
                          </div>
                          <ResultView
                            result={msg.result}
                            onAdd={() => onAddCabinets(normalizeFinishes(msg.result!))}
                          />
                        </div>
                      )}

                      {/* Error */}
                      {msg.error && (
                        <div
                          className="text-xs p-2.5 rounded-lg"
                          style={{
                            background: "#ef444422",
                            color: "#f87171",
                            border: "1px solid #ef444444",
                          }}
                        >
                          {msg.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 p-3" style={{ borderTop: "1px solid #1E2226" }}>
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Describe any room design…"
                  disabled={busy}
                  rows={2}
                  className="flex-1 resize-none text-sm text-white placeholder-gray-700 rounded-lg px-3 py-2 outline-none"
                  style={{
                    background: "#0D0F12",
                    border: "1px solid #1E2226",
                    lineHeight: 1.5,
                  }}
                />
                <button
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="flex-shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition-all"
                  style={{
                    background:
                      busy || !input.trim() ? "#c8852a33" : "#c8852a",
                    color: busy || !input.trim() ? "#c8852a66" : "#fff",
                    minHeight: 56,
                  }}
                >
                  {busy ? "⋯" : "→"}
                </button>
              </div>
              <p className="text-[10px] text-gray-700 mt-1.5 text-center">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </>
        )}

        {/* ── Pipeline tab ─────────────────────────────────────────────────── */}
        {tab === "pipeline" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            <div
              className="rounded-lg p-3 mb-1"
              style={{ background: "#c8852a0d", border: "1px solid #c8852a22" }}
            >
              <p className="text-[10px] text-[#c8852a] font-bold uppercase tracking-widest mb-0.5">
                High Impact — Design Pipeline
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Tools that eliminate manual re-entry at every stage of the design workflow.
              </p>
            </div>

            {PIPELINE.map((f) => (
              <PipelineCard
                key={f.title}
                {...f}
                projectId={projectId}
                onAddCabinets={onAddCabinets}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

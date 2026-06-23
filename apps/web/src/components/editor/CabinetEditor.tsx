"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { useEditorStore } from "@/store/editor";
import { useProject, useRoomCabinets } from "@/hooks/useProject";
import { useCabinets } from "@/hooks/useCabinets";
import { PropertiesPanel } from "./PropertiesPanel";
import { CabinetPreviewModal } from "./CabinetPreviewModal";
import { RoomSelector } from "./RoomSelector";
import { AddCabinetButton } from "./AddCabinetButton";
import AICopilotPanel, { type AICabinetSpec } from "./AICopilotPanel";
import { useCollab } from "@/hooks/useCollab";
import type { Cabinet } from "@woodcraft/shared";

interface Props { projectId: string; }

// ─── Cabinet detail constants (metres) ────────────────────────────────────────
const TOE_H   = 0.089;  // 3.5″ standard toe-kick height
const DOOR_T  = 0.019;  // 19 mm door / drawer-front slab thickness
const INSET   = 0.030;  // shaker border width
const PNL_T   = 0.006;  // raised-panel protrusion above door face
const TOP_H   = 0.038;  // countertop slab ≈ 1.5″
const TOP_OVF = 0.019;  // countertop front overhang (base cabinets)
const TOP_OVI = 0.038;  // countertop overhang all sides (island)
const PGAP    = 0.002;  // gap between adjacent front panels
const HDL_T   = 0.008;  // handle bar cross-section
const HDL_L   = 0.096;  // handle bar length

type Palette = { carcass:string; door:string; doorSel:string; panel:string; panelSel:string; toe:string; handle:string; top:string; };

const PALETTES: Record<string, Palette> = {
  light_oak:     { carcass:"#a07848", door:"#c49a62", doorSel:"#c8852a", panel:"#8c6438", panelSel:"#d4922e", toe:"#6a4a28", handle:"#d0d0d0", top:"#eae2d0" },
  natural_wood:  { carcass:"#5a3e28", door:"#7a5538", doorSel:"#c8852a", panel:"#633222", panelSel:"#d4922e", toe:"#3a2415", handle:"#b8b8b8", top:"#ddd8cc" },
  dark_walnut:   { carcass:"#3d2e1e", door:"#6b5035", doorSel:"#c8852a", panel:"#523c27", panelSel:"#d4922e", toe:"#2a2018", handle:"#b4b4b4", top:"#ddd8cc" },
  white_painted: { carcass:"#d8d8d8", door:"#f0f0f0", doorSel:"#c8852a", panel:"#c8c8c8", panelSel:"#d4922e", toe:"#b8b8b8", handle:"#888888", top:"#fafaf5" },
  modern_gloss:  { carcass:"#1c1c2e", door:"#252545", doorSel:"#c8852a", panel:"#1a1a35", panelSel:"#d4922e", toe:"#12121e", handle:"#e0e0e0", top:"#303030" },
  glass:         { carcass:"#6b5035", door:"#88ccee", doorSel:"#22d3ee", panel:"#0a4060", panelSel:"#38bdf8", toe:"#3d2e1e", handle:"#a07848", top:"#6b5035" },
  metal:         { carcass:"#252525", door:"#383838", doorSel:"#c8852a", panel:"#1e1e1e", panelSel:"#d4922e", toe:"#151515", handle:"#909090", top:"#444444" },
};

const DEFAULT_PALETTE = PALETTES.dark_walnut;

function getPalette(finishStyle?: string, name?: string, notes?: string): Palette {
  const hint = `${name ?? ""} ${notes ?? ""}`.toLowerCase();
  if (hint.includes("fish tank") || hint.includes("aquarium")) return PALETTES.glass;
  return PALETTES[finishStyle ?? ""] ?? DEFAULT_PALETTE;
}

interface FPanel { x: number; y: number; pw: number; ph: number; isDrawer: boolean; }

function buildFrontPanels(
  w: number, h: number, type: string, doors: number, drawers: number
): FPanel[] {
  const hasToe  = ["base","drawer_base","sink_base","island","tall"].includes(type);
  const toeH    = hasToe ? TOE_H : 0;
  const bodyH   = h - toeH;
  const dc      = Math.min(drawers, 5);
  const drawerH = dc > 0 ? Math.min(0.21, (bodyH * 0.45) / dc) : 0;
  const drawerTot = dc * (drawerH + PGAP);
  const doorH   = bodyH - drawerTot;
  const result: FPanel[] = [];

  for (let i = 0; i < dc; i++) {
    result.push({
      x: PGAP, y: toeH + doorH + i * (drawerH + PGAP),
      pw: w - 2 * PGAP, ph: drawerH, isDrawer: true,
    });
  }

  const fc = Math.max(1, Math.min(doors, 4));
  if (doorH > 0.08) {
    const doorW = (w - (fc + 1) * PGAP) / fc;
    for (let i = 0; i < fc; i++) {
      result.push({
        x: PGAP + i * (doorW + PGAP), y: toeH + PGAP,
        pw: doorW, ph: doorH - 2 * PGAP, isDrawer: false,
      });
    }
  }
  return result;
}

function CabinetMesh({ cabinet }: { cabinet: Cabinet }) {
  const selectCabinet = useEditorStore((s) => s.selectCabinet);
  const isSelected    = useEditorStore((s) => s.selectedCabinetId) === cabinet.id;

  const w    = Number(cabinet.width)  / 1000;
  const h    = Number(cabinet.height) / 1000;
  const d    = Number(cabinet.depth)  / 1000;
  const type = cabinet.type as string;
  const prm  = (cabinet.parameters ?? {}) as Record<string, unknown>;
  const doors   = Number(prm.doorCount   ?? (w > 0.65 ? 2 : 1));
  const drawers = Number(prm.drawerCount ?? (type === "drawer_base" ? 3 : 0));

  const hasToe   = ["base","drawer_base","sink_base","island","tall"].includes(type);
  const hasTop   = ["base","drawer_base","sink_base","island"].includes(type);
  const isIsland = type === "island";
  const toeH     = hasToe ? TOE_H : 0;
  const isGlass  = String(prm.finishStyle ?? "").includes("glass") ||
                   `${cabinet.name} ${String(prm.notes ?? "")}`.toLowerCase().includes("fish tank") ||
                   `${cabinet.name}`.toLowerCase().includes("aquarium");

  const panels = useMemo(
    () => buildFrontPanels(w, h, type, doors, drawers),
    [w, h, type, doors, drawers]
  );

  // Group origin = back-left-bottom corner of cabinet footprint
  const gx = Number(cabinet.posX) / 1000;
  const gy = Number(cabinet.posY) / 1000;
  const gz = Number(cabinet.posZ) / 1000;

  const C = getPalette(String(prm.finishStyle ?? ""), cabinet.name, String(prm.notes ?? ""));
  const carcassH = h - toeH;
  const carcassD = d - DOOR_T;
  const doorCol  = isSelected ? C.doorSel  : C.door;
  const pnlCol   = isSelected ? C.panelSel : C.panel;

  // Countertop: overhang front (and all sides for island)
  const topSideOvh  = isIsland ? TOP_OVI : 0;
  const topFrontOvh = isIsland ? TOP_OVI : TOP_OVF;
  const topW  = w + 2 * topSideOvh;
  const topD  = d + topFrontOvh;
  const topZC = topD / 2; // flush at back (Z=0), overhang at front

  return (
    <group
      position={[gx, gy, gz]}
      onClick={(e) => { e.stopPropagation(); selectCabinet(cabinet.id); }}
    >
      {/* Carcass body — back to front-minus-door-thickness */}
      <mesh position={[w / 2, toeH + carcassH / 2, carcassD / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, carcassH, carcassD]} />
        <meshStandardMaterial color={C.carcass} roughness={0.8} metalness={0.02} />
      </mesh>

      {/* Toe-kick board — bottom-front strip */}
      {hasToe && (
        <mesh position={[w / 2, toeH / 2, d - DOOR_T / 2]}>
          <boxGeometry args={[w, toeH, DOOR_T]} />
          <meshStandardMaterial color={C.toe} roughness={0.9} metalness={0} />
        </mesh>
      )}

      {/* Door and drawer front panels */}
      {panels.map((p, i) => {
        const px  = p.x + p.pw / 2;
        const py  = p.y + p.ph / 2;
        const pzC = d - DOOR_T / 2;          // slab centre Z
        const iw  = p.pw - 2 * INSET;
        const ih  = p.ph - 2 * INSET;
        const showPanel = iw > 0.04 && ih > 0.04;
        // Handle: centred horizontally on drawers, on the pull side of doors
        const hx = p.isDrawer ? px : px + p.pw / 2 - 0.035;
        const hy = p.isDrawer ? py : py - p.ph / 4;

        return (
          <group key={i}>
            {/* Front slab — transparent for glass/aquarium units */}
            <mesh position={[px, py, pzC]} castShadow receiveShadow>
              <boxGeometry args={[p.pw, p.ph, DOOR_T]} />
              {isGlass
                ? <meshStandardMaterial color={doorCol} transparent opacity={0.28} roughness={0.05} metalness={0.15} />
                : <meshStandardMaterial color={doorCol} roughness={0.6} metalness={0.03} />
              }
            </mesh>

            {/* Aquarium water volume — only for glass units */}
            {isGlass && (
              <mesh position={[px, py, carcassD / 2]}>
                <boxGeometry args={[p.pw - 0.04, p.ph - 0.04, carcassD - 0.04]} />
                <meshStandardMaterial color="#083858" transparent opacity={0.55} roughness={0.1} />
              </mesh>
            )}

            {/* Shaker raised centre panel — skip for glass */}
            {showPanel && !isGlass && (
              <mesh position={[px, py, d + PNL_T / 2]}>
                <boxGeometry args={[iw, ih, PNL_T]} />
                <meshStandardMaterial color={pnlCol} roughness={0.65} metalness={0.02} />
              </mesh>
            )}

            {/* Handle bar — skip for glass/aquarium */}
            {!isGlass && (
              <mesh position={[hx, hy, d + HDL_T / 2]}>
                <boxGeometry args={p.isDrawer ? [HDL_L, HDL_T, HDL_T] : [HDL_T, HDL_L, HDL_T]} />
                <meshStandardMaterial color={C.handle} roughness={0.25} metalness={0.85} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Countertop slab — base and island types only */}
      {hasTop && (
        <mesh position={[w / 2, h + TOP_H / 2, topZC]} castShadow receiveShadow>
          <boxGeometry args={[topW, TOP_H, topD]} />
          <meshStandardMaterial color={C.top} roughness={0.35} metalness={0.05} />
        </mesh>
      )}
    </group>
  );
}

export default function CabinetEditor({ projectId }: Props) {
  const { project, loading: projectLoading } = useProject(projectId);
  const { selectedRoomId, cabinets, selectedCabinetId, selectCabinet } = useEditorStore();
  const { loading: roomLoading }                                        = useRoomCabinets(projectId, selectedRoomId);
  const { create, save, remove, validate, analyzeDrawing, saving, validating, validationReports } = useCabinets(projectId);
  const { broadcast: _broadcast }                                       = useCollab(projectId);

  const [leftOpen,     setLeftOpen]     = useState(false);
  const [rightOpen,    setRightOpen]    = useState(false);
  const [copilotOpen,  setCopilotOpen]  = useState(false);
  const [previewId,    setPreviewId]    = useState<string | null>(null);

  async function handleAddCabinets(specs: AICabinetSpec[]) {
    // When the AI returns floor-plan positions (sketch-to-CAD path), use them directly.
    // For left/right wall cabinets, swap width ↔ depth so the box renders in the
    // correct orientation (width runs along the wall, depth goes into the room).
    // When positions are absent (co-pilot chat path), fall back to auto-layout.
    const hasPositions = specs.some(
      (s) => s.posX !== undefined && s.posZ !== undefined
    );

    let perimeterX = 0;
    let islandX    = 0;

    for (const spec of specs) {
      let posX: number, posY: number, posZ: number;
      let createWidth = spec.width;
      let createDepth = spec.depth;

      if (hasPositions && spec.posX !== undefined && spec.posZ !== undefined) {
        // ── Sketch path: AI-supplied floor-plan coordinates ──────────────
        posX = spec.posX;
        posZ = spec.posZ;
        // Use AI-provided posY when available; fall back to 1371 only for kitchen wall cabs
        posY = spec.posY ?? (spec.type === "wall" ? 1371 : 0);

        // Left/right wall cabinets need width ↔ depth swap so the box
        // renders with its length running along the wall (Z axis) and its
        // depth going into the room (X axis).
        if (spec.wallSide === "left" || spec.wallSide === "right") {
          createWidth = spec.depth;  // X extent = cabinet depth (into room)
          createDepth = spec.width;  // Z extent = cabinet length (along wall)
        }
      } else {
        // ── Auto-layout fallback (co-pilot chat, no positions) ────────────
        if (spec.type === "island") {
          posX = islandX;
          posY = 0;
          posZ = 1219; // 48" out from the back wall
          islandX += spec.width;
        } else if (spec.type === "wall") {
          posX = perimeterX;
          posY = 1371;
          posZ = 152;
          perimeterX += spec.width;
        } else {
          posX = perimeterX;
          posY = 0;
          posZ = 0;
          perimeterX += spec.width;
        }
      }

      await create({
        type:       spec.type,
        name:       spec.name,
        width:      createWidth,
        height:     spec.height,
        depth:      createDepth,
        posX,
        posY,
        posZ,
        parameters: spec.parameters,
      });
    }
  }

  const selectedCabinet = cabinets.find((c) => c.id === selectedCabinetId);
  const isLoading       = projectLoading || roomLoading;

  // Auto-open properties sheet when a cabinet is selected
  useEffect(() => {
    if (selectedCabinetId) setRightOpen(true);
  }, [selectedCabinetId]);

  // Close right sheet when selection is cleared
  useEffect(() => {
    if (!selectedCabinetId) setRightOpen(false);
  }, [selectedCabinetId]);

  if (projectLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface text-gray-500 text-sm">
        Loading project…
      </div>
    );
  }

  const anyPanelOpen = leftOpen || rightOpen;

  return (
    <div className="flex h-full overflow-hidden relative">

      {/* ── Mobile backdrop ──────────────────────────────────────────────── */}
      {anyPanelOpen && (
        <div
          className="fixed inset-0 z-10 md:hidden"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
          onClick={() => { setLeftOpen(false); setRightOpen(false); }}
        />
      )}

      {/* ── Left panel: Rooms + Cabinet list ─────────────────────────────
           Mobile  → fixed left drawer, slides in/out
           Desktop → static flex column                                   */}
      <aside
        className={[
          "flex flex-col flex-shrink-0",
          "fixed inset-y-0 left-0 z-20 w-72",
          "transition-transform duration-300 ease-in-out",
          leftOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:w-52 md:translate-x-0 md:z-auto md:transition-none",
        ].join(" ")}
        style={{ background: "#111214", borderRight: "1px solid #1E2226" }}
      >
        {/* Panel header */}
        <div
          className="px-3 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid #1E2226" }}
        >
          <p className="text-xs text-gray-400 uppercase tracking-widest">Rooms</p>
          {/* Close button — mobile only */}
          <button
            className="md:hidden text-gray-500 hover:text-white transition-colors p-1"
            onClick={() => setLeftOpen(false)}
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        <div className="p-3" style={{ borderBottom: "1px solid #1E2226" }}>
          <RoomSelector rooms={project?.rooms ?? []} projectId={projectId} />
        </div>

        <div className="flex-1 overflow-auto p-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Cabinets</p>
            <AddCabinetButton projectId={projectId} />
          </div>

          {cabinets.length === 0 ? (
            <p className="text-xs text-gray-600 px-1 mt-3">No cabinets yet.</p>
          ) : (
            <div className="space-y-0.5">
              {cabinets.map((cab) => (
                <button
                  key={cab.id}
                  onClick={() => {
                    selectCabinet(cab.id);
                    setLeftOpen(false); // close drawer after picking on mobile
                  }}
                  className={[
                    "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors",
                    selectedCabinetId === cab.id
                      ? "bg-brand-500/20 text-brand-400"
                      : "text-gray-400 hover:bg-surface-200 hover:text-white",
                  ].join(" ")}
                >
                  <span className="block truncate font-medium">{cab.name}</span>
                  <span className="block text-xs text-gray-600 capitalize mt-0.5">{cab.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── 3D Viewport ──────────────────────────────────────────────────── */}
      <div className="flex-1 relative min-w-0">
        {isLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-surface-100 border border-surface-300 rounded-full px-3 py-1 text-xs text-gray-400">
            Updating…
          </div>
        )}

        {/* ── Mobile floating controls ─────────────────────────────────── */}

        {/* Cabinets toggle — top-left */}
        <button
          className="absolute top-3 left-3 z-10 md:hidden flex items-center gap-1.5 text-xs text-white font-medium rounded-lg px-3 py-2 transition-colors"
          style={{ background: "#1A1E26", border: "1px solid #2E3240" }}
          onClick={() => { setLeftOpen(true); setRightOpen(false); }}
        >
          <span style={{ fontSize: 13 }}>☰</span>
          <span>Cabinets{cabinets.length > 0 ? ` (${cabinets.length})` : ""}</span>
        </button>

        {/* AI Co-pilot toggle — top-right */}
        <button
          className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3 py-2 transition-all"
          style={{
            background: copilotOpen ? "#c8852a" : "#1A1E26",
            border: copilotOpen ? "1px solid #c8852a" : "1px solid #2E3240",
            color: copilotOpen ? "#fff" : "#c8852a",
          }}
          onClick={() => setCopilotOpen((v) => !v)}
        >
          <span>✦</span>
          <span>AI Co-pilot</span>
        </button>

        {/* Properties toggle — bottom-centre, only when cabinet is selected */}
        {selectedCabinet && (
          <button
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 md:hidden flex items-center gap-2 text-xs font-bold rounded-full px-5 py-2.5 transition-colors"
            style={{
              background: rightOpen ? "#2E2E2E" : "#c8852a",
              color: rightOpen ? "#9A9090" : "#fff",
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}
            onClick={() => setRightOpen((v) => !v)}
          >
            {rightOpen ? "✕  Close" : `⚙  ${selectedCabinet.name}`}
          </button>
        )}

        <Canvas
          shadows
          camera={{ position: [3, 2.5, 4], fov: 50 }}
          onPointerMissed={() => selectCabinet(null)}
        >
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Grid
            args={[20, 20]}
            cellSize={0.6} cellThickness={0.5} cellColor="#2e2e2e"
            sectionSize={1.2} sectionThickness={1} sectionColor="#3a3a3a"
            fadeDistance={30} fadeStrength={1} followCamera={false} infiniteGrid
          />
          {cabinets.map((cab) => (
            <CabinetMesh key={cab.id} cabinet={cab} />
          ))}
          <OrbitControls makeDefault />
          <Environment preset="warehouse" background={false} />
        </Canvas>

        {cabinets.length === 0 && !isLoading && !copilotOpen && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-500 text-sm">Add a cabinet to get started.</p>
          </div>
        )}

        {/* AI Co-pilot panel */}
        <AICopilotPanel
          projectId={projectId}
          roomId={selectedRoomId}
          isOpen={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          onAddCabinets={handleAddCabinets}
        />
      </div>

      {/* ── Properties panel ─────────────────────────────────────────────
           Mobile  → fixed bottom sheet, slides up/down
           Desktop → static right column                                  */}
      <PropertiesPanel
        cabinet={selectedCabinet}
        saving={saving}
        validating={validating}
        validationReport={selectedCabinetId ? validationReports[selectedCabinetId] : undefined}
        onSave={save}
        onDelete={remove}
        onValidate={validate}
        onAnalyzeDrawing={analyzeDrawing}
        onPreview={setPreviewId}
        mobileOpen={rightOpen}
        onMobileClose={() => setRightOpen(false)}
      />

      {previewId && (() => {
        const cab = cabinets.find((c) => c.id === previewId);
        return cab ? (
          <CabinetPreviewModal
            cabinet={cab}
            projectId={projectId}
            onClose={() => setPreviewId(null)}
          />
        ) : null;
      })()}
    </div>
  );
}

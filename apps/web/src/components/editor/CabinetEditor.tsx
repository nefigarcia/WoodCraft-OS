"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { useEditorStore } from "@/store/editor";
import { useProject, useRoomCabinets } from "@/hooks/useProject";
import { useCabinets } from "@/hooks/useCabinets";
import { PropertiesPanel } from "./PropertiesPanel";
import { CabinetPreviewModal } from "./CabinetPreviewModal";
import { RoomSelector } from "./RoomSelector";
import { AddCabinetButton } from "./AddCabinetButton";
import { useCollab } from "@/hooks/useCollab";
import type { Cabinet } from "@woodcraft/shared";

interface Props { projectId: string; }

function CabinetMesh({ cabinet }: { cabinet: Cabinet }) {
  const selectCabinet = useEditorStore((s) => s.selectCabinet);
  const selectedId    = useEditorStore((s) => s.selectedCabinetId);
  const isSelected    = selectedId === cabinet.id;

  const w = Number(cabinet.width)  / 1000;
  const h = Number(cabinet.height) / 1000;
  const d = Number(cabinet.depth)  / 1000;

  return (
    <mesh
      position={[
        Number(cabinet.posX) / 1000 + w / 2,
        Number(cabinet.posY) / 1000 + h / 2,
        Number(cabinet.posZ) / 1000 + d / 2,
      ]}
      castShadow
      receiveShadow
      onClick={(e) => { e.stopPropagation(); selectCabinet(cabinet.id); }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={isSelected ? "#c8852a" : "#5a4a3a"}
        roughness={0.75}
        metalness={0.05}
      />
    </mesh>
  );
}

export default function CabinetEditor({ projectId }: Props) {
  const { project, loading: projectLoading } = useProject(projectId);
  const { selectedRoomId, cabinets, selectedCabinetId, selectCabinet } = useEditorStore();
  const { loading: roomLoading }                                        = useRoomCabinets(projectId, selectedRoomId);
  const { save, remove, validate, analyzeDrawing, saving, validating, validationReports } = useCabinets(projectId);
  const { broadcast: _broadcast }                                       = useCollab(projectId);

  const [leftOpen,   setLeftOpen]   = useState(false);
  const [rightOpen,  setRightOpen]  = useState(false);
  const [previewId,  setPreviewId]  = useState<string | null>(null);

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

        {cabinets.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-500 text-sm">Add a cabinet to get started.</p>
          </div>
        )}
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

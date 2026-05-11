"use client";

import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment } from "@react-three/drei";
import { useEditorStore } from "@/store/editor";
import { useProject, useRoomCabinets } from "@/hooks/useProject";
import { useCabinets } from "@/hooks/useCabinets";
import { PropertiesPanel } from "./PropertiesPanel";
import { RoomSelector } from "./RoomSelector";
import { AddCabinetButton } from "./AddCabinetButton";
import type { Cabinet } from "@woodcraft/shared";

interface Props {
  projectId: string;
}

function CabinetMesh({ cabinet }: { cabinet: Cabinet }) {
  const selectCabinet = useEditorStore((s) => s.selectCabinet);
  const selectedId = useEditorStore((s) => s.selectedCabinetId);
  const isSelected = selectedId === cabinet.id;

  const w = Number(cabinet.width) / 1000;
  const h = Number(cabinet.height) / 1000;
  const d = Number(cabinet.depth) / 1000;

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
  const { loading: roomLoading } = useRoomCabinets(projectId, selectedRoomId);
  const { save, remove, validate, saving, validating } = useCabinets(projectId);

  const selectedCabinet = cabinets.find((c) => c.id === selectedCabinetId);
  const isLoading = projectLoading || roomLoading;

  if (projectLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface text-gray-500 text-sm">
        Loading project…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Room selector + cabinet list */}
      <aside className="w-52 flex-shrink-0 bg-surface-50 border-r border-surface-200 flex flex-col">
        <div className="p-3 border-b border-surface-200">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Rooms</p>
          <RoomSelector rooms={project?.rooms ?? []} projectId={projectId} />
        </div>

        <div className="flex-1 overflow-auto p-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Cabinets</p>
            <AddCabinetButton projectId={projectId} />
          </div>
          {cabinets.length === 0 ? (
            <p className="text-xs text-gray-600 px-1">None yet.</p>
          ) : (
            <div className="space-y-0.5">
              {cabinets.map((cab) => (
                <button
                  key={cab.id}
                  onClick={() => selectCabinet(cab.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                    selectedCabinetId === cab.id
                      ? "bg-brand-500/20 text-brand-400"
                      : "text-gray-400 hover:bg-surface-200 hover:text-white"
                  }`}
                >
                  <span className="block truncate">{cab.name}</span>
                  <span className="block text-xs text-gray-600 capitalize">{cab.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 3D Viewport */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-surface-100 border border-surface-300 rounded-full px-3 py-1 text-xs text-gray-400">
            Updating…
          </div>
        )}

        <Canvas
          shadows
          camera={{ position: [3, 2.5, 4], fov: 50 }}
          onPointerMissed={() => selectCabinet(null)}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} />

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

      {/* Right: Properties panel */}
      <PropertiesPanel
        cabinet={selectedCabinet}
        saving={saving}
        validating={validating}
        onSave={save}
        onDelete={remove}
        onValidate={validate}
      />
    </div>
  );
}

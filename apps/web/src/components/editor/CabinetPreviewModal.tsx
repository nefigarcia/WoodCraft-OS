"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { BufferGeometry, Box3, Vector3 } from "three";
import { apiClient } from "@/lib/api";
import type { Cabinet } from "@woodcraft/shared";

interface MeshData {
  geometry: BufferGeometry;
  // offset to apply to the mesh so its center lands at world origin
  offset: [number, number, number];
  // camera starting position (already outside the cabinet)
  camPos: [number, number, number];
}

function parseMeshData(buffer: ArrayBuffer): MeshData {
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);
  geometry.computeVertexNormals();

  const box = new Box3().setFromBufferAttribute(
    geometry.attributes.position as never
  );
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  // Place camera far enough to see the whole cabinet from a 3/4 angle
  const dist = Math.max(size.x, size.y, size.z) * 2.2;

  return {
    geometry,
    offset: [-center.x, -center.y, -center.z],
    camPos: [dist * 0.8, dist * 0.6, dist],
  };
}

interface Props {
  cabinet: Cabinet;
  projectId: string;
  onClose: () => void;
}

export function CabinetPreviewModal({ cabinet, projectId, onClose }: Props) {
  const [meshData, setMeshData] = useState<MeshData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .download(`/projects/${projectId}/rooms/${cabinet.roomId}/cabinets/${cabinet.id}/mesh`)
      .then(async (blob) => {
        if (cancelled) return;
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;
        setMeshData(parseMeshData(buffer));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load model — ensure cad-service is running.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [cabinet.id, cabinet.roomId, projectId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.78)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          width: "min(92vw, 860px)",
          height: "min(88vh, 620px)",
          background: "#0d0f11",
          border: "1px solid #1E2226",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #1E2226" }}
        >
          <div>
            <p className="text-white text-sm font-semibold">{cabinet.name}</p>
            <p className="text-gray-500 text-xs capitalize">
              {cabinet.type} cabinet &mdash;{" "}
              {Number(cabinet.width).toFixed(0)}&thinsp;&times;&thinsp;
              {Number(cabinet.height).toFixed(0)}&thinsp;&times;&thinsp;
              {Number(cabinet.depth).toFixed(0)}&thinsp;mm
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1 text-lg leading-none"
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        {/* Viewport */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
              <p className="text-gray-500 text-xs">Generating 3D model…</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {meshData && (
            <>
              {/* Camera position is set once before Canvas mounts — no first-frame flash */}
              <Canvas
                shadows
                camera={{ position: meshData.camPos, fov: 45, near: 1, far: 100_000 }}
                style={{ background: "#0d0f11" }}
                gl={{ antialias: true }}
              >
                <ambientLight intensity={0.55} />
                <directionalLight
                  position={[5, 8, 5]}
                  intensity={1.4}
                  castShadow
                  shadow-mapSize={[2048, 2048]}
                />
                <directionalLight position={[-3, 4, -3]} intensity={0.35} />

                {/* Mesh offset so its center sits at world origin — OrbitControls target stays at 0,0,0 */}
                <mesh
                  geometry={meshData.geometry}
                  position={meshData.offset}
                  castShadow
                  receiveShadow
                >
                  <meshStandardMaterial color="#c8852a" roughness={0.65} metalness={0.05} />
                </mesh>

                <OrbitControls
                  makeDefault
                  target={[0, 0, 0]}
                  autoRotate
                  autoRotateSpeed={0.6}
                  enablePan={false}
                />
                <Environment preset="warehouse" background={false} />
              </Canvas>

              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-gray-700 text-xs pointer-events-none whitespace-nowrap">
                Drag to orbit &nbsp;·&nbsp; Scroll to zoom
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

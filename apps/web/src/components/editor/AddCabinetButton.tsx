"use client";

import { useState } from "react";
import { useCabinets } from "@/hooks/useCabinets";
import { useEditorStore } from "@/store/editor";

const DEFAULTS: Record<string, { width: number; height: number; depth: number }> = {
  base: { width: 600, height: 720, depth: 560 },
  wall: { width: 600, height: 720, depth: 320 },
  tall: { width: 600, height: 2100, depth: 560 },
  corner: { width: 900, height: 720, depth: 900 },
  island: { width: 1200, height: 900, depth: 800 },
};

interface Props { projectId: string }

export function AddCabinetButton({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<keyof typeof DEFAULTS>("base");
  const [name, setName] = useState("");
  const { create, saving } = useCabinets(projectId);
  const selectedRoomId = useEditorStore((s) => s.selectedRoomId);

  async function handleAdd() {
    if (!selectedRoomId) return;
    const dims = DEFAULTS[selectedType]!;
    await create({
      type: selectedType as "base",
      name: name || `${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Cabinet`,
      ...dims,
    });
    setOpen(false);
    setName("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!selectedRoomId}
        title={!selectedRoomId ? "Select a room first" : "Add cabinet"}
        className="text-brand-400 hover:text-brand-300 disabled:text-gray-700 text-lg leading-none transition-colors"
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-50 border border-surface-200 rounded-xl p-6 w-80 shadow-xl">
            <h3 className="text-white font-semibold mb-4">Add Cabinet</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as keyof typeof DEFAULTS)}
                  className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {Object.keys(DEFAULTS).map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name (optional)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)} Cabinet`}
                  className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div className="text-xs text-gray-500">
                Default: {DEFAULTS[selectedType]?.width}W × {DEFAULTS[selectedType]?.height}H × {DEFAULTS[selectedType]?.depth}D mm
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                className="flex-1 text-sm text-gray-400 hover:text-white py-1.5 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={saving || !selectedRoomId}
                className="flex-1 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-1.5 rounded-md transition-colors"
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

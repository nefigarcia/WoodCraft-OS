"use client";

import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api";
import { useEditorStore } from "@/store/editor";
import type { Cabinet } from "@woodcraft/shared";

interface CreateCabinetInput {
  type: "base" | "wall" | "tall" | "corner" | "island";
  name: string;
  width: number;
  height: number;
  depth: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  parameters?: Record<string, unknown>;
}

interface UpdateCabinetInput {
  name?: string;
  width?: number;
  height?: number;
  depth?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
  parameters?: Record<string, unknown>;
  materialId?: string | null;
}

interface CabinetResponse extends Cabinet {
  _cadWarnings?: string[];
}

export function useCabinets(projectId: string) {
  const { selectedRoomId, cabinets, setCabinets, updateCabinet, markClean } = useEditorStore();
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [lastValidation, setLastValidation] = useState<Record<string, unknown> | null>(null);

  const baseUrl = (cabinetId?: string) => {
    const base = `/projects/${projectId}/rooms/${selectedRoomId}/cabinets`;
    return cabinetId ? `${base}/${cabinetId}` : base;
  };

  const create = useCallback(
    async (data: CreateCabinetInput): Promise<Cabinet | null> => {
      if (!selectedRoomId) return null;
      setSaving(true);
      try {
        const cabinet = await apiClient.post<CabinetResponse>(baseUrl(), data);
        setCabinets([...cabinets, cabinet]);
        return cabinet;
      } catch (e: unknown) {
        console.error("Create cabinet failed:", e);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [selectedRoomId, cabinets, setCabinets]
  );

  // Called by the properties panel after debounce fires.
  // Optimistic update already applied to the store; this persists it and
  // receives the fresh parts list from the constraint propagation pipeline.
  const save = useCallback(
    async (cabinetId: string, patch: UpdateCabinetInput): Promise<void> => {
      if (!selectedRoomId) return;
      setSaving(true);
      try {
        const updated = await apiClient.patch<CabinetResponse>(
          baseUrl(cabinetId),
          patch
        );
        // Replace the cabinet in the store with the server version (includes fresh parts)
        updateCabinet(cabinetId, updated);
        markClean();
      } catch (e: unknown) {
        console.error("Save cabinet failed:", e);
      } finally {
        setSaving(false);
      }
    },
    [selectedRoomId, updateCabinet, markClean]
  );

  const remove = useCallback(
    async (cabinetId: string): Promise<void> => {
      if (!selectedRoomId) return;
      try {
        await apiClient.delete(baseUrl(cabinetId));
        setCabinets(cabinets.filter((c) => c.id !== cabinetId));
      } catch (e: unknown) {
        console.error("Delete cabinet failed:", e);
      }
    },
    [selectedRoomId, cabinets, setCabinets]
  );

  const validate = useCallback(
    async (cabinetId: string): Promise<void> => {
      if (!selectedRoomId) return;
      setValidating(true);
      try {
        const report = await apiClient.post<Record<string, unknown>>(
          `${baseUrl(cabinetId)}/validate`,
          {}
        );
        setLastValidation(report);
      } catch (e: unknown) {
        console.error("Validate cabinet failed:", e);
      } finally {
        setValidating(false);
      }
    },
    [selectedRoomId]
  );

  return { saving, validating, lastValidation, create, save, remove, validate };
}

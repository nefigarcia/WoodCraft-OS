"use client";

import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { useEditorStore } from "@/store/editor";
import type { Room, Cabinet } from "@woodcraft/shared";

interface ProjectData {
  id: string;
  name: string;
  status: string;
  client: { id: string; name: string } | null;
  rooms: (Room & { _count: { cabinets: number } })[];
}

export function useProject(projectId: string) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setProject: storeSetProject, setRooms, selectRoom } = useEditorStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ProjectData>(`/projects/${projectId}`);
      setProject(data);
      storeSetProject(projectId);
      setRooms(data.rooms as Room[]);
      if (data.rooms[0]) selectRoom(data.rooms[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId, storeSetProject, setRooms, selectRoom]);

  useEffect(() => { void load(); }, [load]);

  return { project, loading, error, reload: load };
}

export function useRoomCabinets(projectId: string, roomId: string | null) {
  const [loading, setLoading] = useState(false);
  const { setCabinets, selectRoom } = useEditorStore();

  const load = useCallback(async (rid: string) => {
    setLoading(true);
    try {
      const cabinets = await apiClient.get<Cabinet[]>(
        `/projects/${projectId}/rooms/${rid}/cabinets`
      );
      setCabinets(cabinets);
      selectRoom(rid);
    } catch {
      setCabinets([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, setCabinets, selectRoom]);

  useEffect(() => {
    if (roomId) void load(roomId);
  }, [roomId, load]);

  return { loading, reload: load };
}

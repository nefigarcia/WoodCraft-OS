import { create } from "zustand";
import type { Cabinet, Room } from "@woodcraft/shared";

interface EditorState {
  projectId: string | null;
  rooms: Room[];
  selectedRoomId: string | null;
  cabinets: Cabinet[];
  selectedCabinetId: string | null;
  isDirty: boolean;

  setProject: (projectId: string) => void;
  setRooms: (rooms: Room[]) => void;
  selectRoom: (roomId: string | null) => void;
  setCabinets: (cabinets: Cabinet[]) => void;
  selectCabinet: (cabinetId: string | null) => void;
  updateCabinet: (id: string, patch: Partial<Cabinet>) => void;
  markDirty: () => void;
  markClean: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  projectId: null,
  rooms: [],
  selectedRoomId: null,
  cabinets: [],
  selectedCabinetId: null,
  isDirty: false,

  setProject: (projectId) => set({ projectId }),

  setRooms: (rooms) => set({ rooms }),

  selectRoom: (selectedRoomId) => set({ selectedRoomId }),

  setCabinets: (cabinets) => set({ cabinets }),

  selectCabinet: (selectedCabinetId) => set({ selectedCabinetId }),

  updateCabinet: (id, patch) =>
    set((state) => ({
      cabinets: state.cabinets.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
      isDirty: true,
    })),

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
}));

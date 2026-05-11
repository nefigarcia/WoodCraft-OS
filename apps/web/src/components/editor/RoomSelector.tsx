"use client";

import { useEditorStore } from "@/store/editor";
import type { Room } from "@woodcraft/shared";

interface Props {
  rooms: (Room & { _count?: { cabinets: number } })[];
  projectId: string;
}

export function RoomSelector({ rooms }: Props) {
  const { selectedRoomId, selectRoom } = useEditorStore();

  if (rooms.length === 0) {
    return <p className="text-xs text-gray-600">No rooms yet.</p>;
  }

  return (
    <div className="space-y-0.5">
      {rooms.map((room) => (
        <button
          key={room.id}
          onClick={() => selectRoom(room.id)}
          className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
            selectedRoomId === room.id
              ? "bg-brand-500/20 text-brand-400"
              : "text-gray-400 hover:bg-surface-200 hover:text-white"
          }`}
        >
          <span className="block truncate">{room.name}</span>
          {room._count && (
            <span className="text-xs text-gray-600">
              {room._count.cabinets} cabinet{room._count.cabinets !== 1 ? "s" : ""}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

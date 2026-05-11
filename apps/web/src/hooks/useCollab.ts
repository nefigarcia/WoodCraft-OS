"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/store/auth";
import { useEditorStore } from "@/store/editor";
import type { Cabinet } from "@woodcraft/shared";

const WS_URL = process.env.NEXT_PUBLIC_COLLAB_WS_URL ?? "ws://localhost:8005";

type CollabMessage =
  | { type: "user_joined"; userId: string }
  | { type: "user_left"; userId: string }
  | { type: "cabinet_update"; cabinetId: string; patch: Partial<Cabinet>; fromUserId: string }
  | { type: "cabinet_added"; cabinet: Cabinet; fromUserId: string }
  | { type: "cabinet_removed"; cabinetId: string; fromUserId: string };

export function useCollab(projectId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.user?.id);
  const { updateCabinet, setCabinets, cabinets } = useEditorStore();

  useEffect(() => {
    if (!accessToken || !projectId) return;

    const url = `${WS_URL}/projects/${projectId}?token=${accessToken}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.debug("[collab] connected to project", projectId);
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: CollabMessage;
      try {
        msg = JSON.parse(event.data) as CollabMessage;
      } catch {
        return;
      }

      // Only apply changes from other users
      if ("fromUserId" in msg && msg.fromUserId === userId) return;

      switch (msg.type) {
        case "cabinet_update":
          updateCabinet(msg.cabinetId, msg.patch);
          break;
        case "cabinet_added":
          useEditorStore.getState().setCabinets([
            ...useEditorStore.getState().cabinets,
            msg.cabinet,
          ]);
          break;
        case "cabinet_removed":
          useEditorStore
            .getState()
            .setCabinets(
              useEditorStore.getState().cabinets.filter((c) => c.id !== msg.cabinetId)
            );
          break;
        default:
          break;
      }
    };

    ws.onerror = (err) => {
      console.debug("[collab] WebSocket error (service may not be running):", err);
    };

    ws.onclose = () => {
      console.debug("[collab] disconnected");
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, accessToken, userId, updateCabinet]);

  const broadcast = useCallback((message: Omit<CollabMessage, "fromUserId">) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ ...message, fromUserId: userId }));
  }, [userId]);

  return { broadcast };
}

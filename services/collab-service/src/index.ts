import http from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import type { IncomingMessage } from "node:http";

const PORT = Number(process.env.PORT ?? 8005);
const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? "";

interface TokenPayload {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

interface CollabClient {
  ws: WebSocket;
  userId: string;
  orgId: string;
  projectId: string;
}

// In-memory room map: projectId → set of connected clients
const rooms = new Map<string, Set<CollabClient>>();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get("/health", (_req, res) => {
  const totalClients = [...rooms.values()].reduce((sum, s) => sum + s.size, 0);
  res.json({ status: "ok", service: "collab-service", connectedClients: totalClients });
});

function parseToken(req: IncomingMessage): TokenPayload | null {
  const url = new URL(req.url ?? "", `http://localhost`);
  const token = url.searchParams.get("token");
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

function getProjectId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "", `http://localhost`);
  return url.pathname.split("/")[2] ?? null; // /projects/:projectId
}

function broadcast(projectId: string, message: object, excludeUserId?: string) {
  const room = rooms.get(projectId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client.userId === excludeUserId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

wss.on("connection", (ws, req) => {
  const payload = parseToken(req);
  const projectId = getProjectId(req);

  if (!payload || !projectId) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const client: CollabClient = { ws, userId: payload.userId, orgId: payload.orgId, projectId };

  if (!rooms.has(projectId)) rooms.set(projectId, new Set());
  rooms.get(projectId)!.add(client);

  // Notify others in the room
  broadcast(projectId, { type: "user_joined", userId: payload.userId }, payload.userId);

  ws.on("message", (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString()) as Record<string, unknown>;
    } catch {
      return;
    }
    // Relay cabinet updates to all other collaborators in the project
    broadcast(projectId, { ...msg, fromUserId: payload.userId }, payload.userId);
  });

  ws.on("close", () => {
    rooms.get(projectId)?.delete(client);
    if (rooms.get(projectId)?.size === 0) rooms.delete(projectId);
    broadcast(projectId, { type: "user_left", userId: payload.userId });
  });
});

server.listen(PORT, () => {
  console.log(`collab-service listening on port ${PORT}`);
});

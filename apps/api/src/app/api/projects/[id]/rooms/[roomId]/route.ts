import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateRoomSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string } };

async function findRoom(roomId: string, projectId: string, orgId: string) {
  return prisma.room.findFirst({ where: { id: roomId, projectId, orgId } });
}

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const room = await prisma.room.findFirst({
    where: { id: params.roomId, projectId: params.id, orgId },
    include: {
      cabinets: {
        include: { parts: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!room) return apiError("Room not found", 404);

  return ok(room);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateRoomSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  if (!await findRoom(params.roomId, params.id, orgId)) return apiError("Room not found", 404);

  const updated = await prisma.room.update({ where: { id: params.roomId }, data: parsed.data as Prisma.RoomUpdateInput });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  if (!await findRoom(params.roomId, params.id, orgId)) return apiError("Room not found", 404);

  await prisma.room.delete({ where: { id: params.roomId } });
  return ok({ id: params.roomId });
}

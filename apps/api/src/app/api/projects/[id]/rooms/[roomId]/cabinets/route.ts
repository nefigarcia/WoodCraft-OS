import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, createCabinetSchema } from "@/lib/validate";
import { cadService } from "@/lib/services";
import { syncParts } from "@/lib/parts";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string } };

async function assertRoom(roomId: string, projectId: string, orgId: string) {
  return prisma.room.findFirst({ where: { id: roomId, projectId, orgId } });
}

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  if (!await assertRoom(params.roomId, params.id, orgId)) {
    return apiError("Room not found", 404);
  }

  const cabinets = await prisma.cabinet.findMany({
    where: { roomId: params.roomId, orgId },
    include: { parts: { orderBy: { partType: "asc" } }, material: true },
    orderBy: { createdAt: "asc" },
  });

  return ok(cabinets);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  if (!await assertRoom(params.roomId, params.id, orgId)) {
    return apiError("Room not found", 404);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createCabinetSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  // Verify materialId ownership if provided
  if (parsed.data.materialId) {
    const mat = await prisma.material.findFirst({ where: { id: parsed.data.materialId, orgId } });
    if (!mat) return apiError("Material not found", 404);
  }

  // Create the cabinet record first
  const cabinet = await prisma.cabinet.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { ...parsed.data, roomId: params.roomId, orgId } as any,
  });

  // Call cad-service to compute initial parts (non-fatal if unavailable)
  const geometry = await cadService
    .computeGeometry({
      cabinet_id: cabinet.id,
      type: cabinet.type,
      width: Number(cabinet.width),
      height: Number(cabinet.height),
      depth: Number(cabinet.depth),
      parameters: cabinet.parameters as Record<string, unknown>,
      material_thickness: 18,
    })
    .catch((err: unknown) => {
      console.error("[cad-service] geometry request failed:", err);
      return null;
    });

  const parts = geometry
    ? await syncParts(cabinet.id, orgId, geometry.parts)
    : [];

  return ok({ ...cabinet, parts, _cadWarnings: geometry?.warnings ?? [] }, 201);
}

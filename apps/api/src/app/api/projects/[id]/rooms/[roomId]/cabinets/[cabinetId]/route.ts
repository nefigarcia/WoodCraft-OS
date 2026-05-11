import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateCabinetSchema } from "@/lib/validate";
import { cadService } from "@/lib/services";
import { syncParts } from "@/lib/parts";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string; cabinetId: string } };

async function findCabinet(cabinetId: string, roomId: string, projectId: string, orgId: string) {
  return prisma.cabinet.findFirst({
    where: {
      id: cabinetId,
      orgId,
      roomId,
      room: { projectId },
    },
    include: { parts: { orderBy: { partType: "asc" } }, material: true },
  });
}

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const cabinet = await findCabinet(params.cabinetId, params.roomId, params.id, orgId);
  if (!cabinet) return apiError("Cabinet not found", 404);

  return ok(cabinet);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateCabinetSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const existing = await findCabinet(params.cabinetId, params.roomId, params.id, orgId);
  if (!existing) return apiError("Cabinet not found", 404);

  if (parsed.data.materialId) {
    const mat = await prisma.material.findFirst({ where: { id: parsed.data.materialId, orgId } });
    if (!mat) return apiError("Material not found", 404);
  }

  // Merge parameters rather than replacing the entire JSON object
  const mergedParameters =
    parsed.data.parameters
      ? { ...(existing.parameters as Record<string, unknown>), ...parsed.data.parameters }
      : undefined;

  const updated = await prisma.cabinet.update({
    where: { id: params.cabinetId },
    data: {
      ...parsed.data,
      ...(mergedParameters && { parameters: mergedParameters }),
    },
  });

  // ── Constraint propagation ──────────────────────────────────────────────────
  // Any change to dimensions or parameters requires a full geometry recompute.
  const dimensionsChanged =
    parsed.data.width !== undefined ||
    parsed.data.height !== undefined ||
    parsed.data.depth !== undefined ||
    parsed.data.parameters !== undefined;

  let parts = existing.parts;
  const cadWarnings: string[] = [];

  if (dimensionsChanged) {
    const geometry = await cadService
      .computeGeometry({
        cabinet_id: updated.id,
        type: updated.type,
        width: Number(updated.width),
        height: Number(updated.height),
        depth: Number(updated.depth),
        parameters: (mergedParameters ?? existing.parameters) as Record<string, unknown>,
        material_thickness: 18,
      })
      .catch((err: unknown) => {
        console.error("[cad-service] geometry recompute failed:", err);
        return null;
      });

    if (geometry) {
      parts = await syncParts(updated.id, orgId, geometry.parts);
      cadWarnings.push(...geometry.warnings);
    }
    // If cad-service is unavailable, return stale parts — caller sees _cadWarnings
  }

  return ok({ ...updated, parts, _cadWarnings: cadWarnings });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const existing = await findCabinet(params.cabinetId, params.roomId, params.id, orgId);
  if (!existing) return apiError("Cabinet not found", 404);

  await prisma.cabinet.delete({ where: { id: params.cabinetId } });
  return ok({ id: params.cabinetId });
}

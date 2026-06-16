import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@woodcraft/db";
import { getContext } from "@/lib/context";
import { parseBody } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string; cabinetId: string; partId: string } };

const updatePartSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  partType: z.string().min(1).max(100).optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  thickness: z.number().positive().optional(),
  quantity: z.number().int().positive().optional(),
  materialId: z.string().cuid().nullable().optional(),
  grainDir: z.enum(["horizontal", "vertical", "none"]).nullable().optional(),
  edgeBanding: z.object({
    top: z.boolean(), bottom: z.boolean(), left: z.boolean(), right: z.boolean(),
  }).nullable().optional(),
  cutParams: z.record(z.unknown()).nullable().optional(),
  assemblyGroup: z.enum(["carcass", "face_frame", "door", "drawer", "shelf"]).nullable().optional(),
});

async function findPart(partId: string, cabinetId: string, orgId: string) {
  return prisma.cabinetPart.findFirst({
    where: { id: partId, cabinetId, orgId },
  });
}

// PATCH — edit any part (manual or CAD-computed)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const existing = await findPart(params.partId, params.cabinetId, orgId);
  if (!existing) return apiError("Part not found", 404);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updatePartSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const d = parsed.data;
  // Use UncheckedUpdateInput so materialId (scalar FK) is accepted directly.
  const updateData: Prisma.CabinetPartUncheckedUpdateInput = {};
  if (d.name          !== undefined) updateData.name          = d.name;
  if (d.partType      !== undefined) updateData.partType      = d.partType;
  if (d.width         !== undefined) updateData.width         = d.width;
  if (d.height        !== undefined) updateData.height        = d.height;
  if (d.thickness     !== undefined) updateData.thickness     = d.thickness;
  if (d.quantity      !== undefined) updateData.quantity      = d.quantity;
  if (d.materialId    !== undefined) updateData.materialId    = d.materialId;
  if (d.grainDir      !== undefined) updateData.grainDir      = d.grainDir;
  if (d.edgeBanding   !== undefined) {
    updateData.edgeBanding = d.edgeBanding === null
      ? Prisma.DbNull
      : (d.edgeBanding as Prisma.InputJsonValue);
  }
  if (d.cutParams     !== undefined) {
    updateData.cutParams = d.cutParams === null
      ? Prisma.DbNull
      : (d.cutParams as Prisma.InputJsonValue);
  }
  if (d.assemblyGroup !== undefined) updateData.assemblyGroup = d.assemblyGroup;

  const updated = await prisma.cabinetPart.update({
    where: { id: params.partId },
    data: updateData,
  });

  return ok(updated);
}

// DELETE — remove a part; only manual parts can be deleted this way
export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const existing = await findPart(params.partId, params.cabinetId, orgId);
  if (!existing) return apiError("Part not found", 404);
  if (!existing.isManual) return apiError("Only manually added parts can be deleted. CAD-computed parts are managed automatically.", 400);

  await prisma.cabinetPart.delete({ where: { id: params.partId } });
  return ok({ id: params.partId });
}

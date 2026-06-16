import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@woodcraft/db";
import { getContext } from "@/lib/context";
import { parseBody } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; roomId: string; cabinetId: string } };

const createPartSchema = z.object({
  name: z.string().min(1).max(100),
  partType: z.string().min(1).max(100),
  width: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  quantity: z.number().int().positive().default(1),
  materialId: z.string().cuid().nullable().optional(),
  grainDir: z.enum(["horizontal", "vertical", "none"]).nullable().optional(),
  edgeBanding: z.object({
    top: z.boolean(), bottom: z.boolean(), left: z.boolean(), right: z.boolean(),
  }).nullable().optional(),
  cutParams: z.record(z.unknown()).nullable().optional(),
  assemblyGroup: z.enum(["carcass", "face_frame", "door", "drawer", "shelf"]).nullable().optional(),
});

async function cabinetBelongsToOrg(cabinetId: string, roomId: string, projectId: string, orgId: string) {
  return prisma.cabinet.findFirst({
    where: { id: cabinetId, orgId, roomId, room: { projectId } },
    select: { id: true },
  });
}

// POST — add a manual part to a cabinet
export async function POST(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const cabinet = await cabinetBelongsToOrg(params.cabinetId, params.roomId, params.id, orgId);
  if (!cabinet) return apiError("Cabinet not found", 404);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createPartSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const part = await prisma.cabinetPart.create({
    data: {
      cabinetId: params.cabinetId,
      orgId,
      isManual: true,
      name: parsed.data.name,
      partType: parsed.data.partType,
      width: parsed.data.width,
      height: parsed.data.height,
      thickness: parsed.data.thickness,
      quantity: parsed.data.quantity,
      materialId: parsed.data.materialId ?? null,
      grainDir: parsed.data.grainDir ?? null,
      edgeBanding: parsed.data.edgeBanding ?? undefined,
      cutParams: parsed.data.cutParams == null ? undefined : (parsed.data.cutParams as Prisma.InputJsonValue),
      assemblyGroup: parsed.data.assemblyGroup ?? null,
    },
  });

  return ok(part, 201);
}

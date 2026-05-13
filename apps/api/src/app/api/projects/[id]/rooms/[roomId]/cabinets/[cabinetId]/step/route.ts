import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { cadService } from "@/lib/services";
import { apiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type Params = { params: { id: string; roomId: string; cabinetId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const cabinet = await prisma.cabinet.findFirst({
    where: {
      id: params.cabinetId,
      orgId,
      roomId: params.roomId,
      room: { projectId: params.id },
    },
  });
  if (!cabinet) return apiError("Cabinet not found", 404);

  let stepBuffer: ArrayBuffer;
  try {
    stepBuffer = await cadService.exportStep(cabinet.id, {
      cabinet_id: cabinet.id,
      type: cabinet.type,
      width: Number(cabinet.width),
      height: Number(cabinet.height),
      depth: Number(cabinet.depth),
      parameters: (cabinet.parameters ?? {}) as Record<string, unknown>,
      material_thickness: 18,
    });
  } catch {
    return apiError("STEP generation failed — ensure cad-service is running", 503);
  }

  const name = (cabinet.name ?? cabinet.id).replace(/[^\w-]/g, "_");
  return new NextResponse(stepBuffer, {
    headers: {
      "Content-Type": "application/step",
      "Content-Disposition": `attachment; filename="${name}.step"`,
    },
  });
}

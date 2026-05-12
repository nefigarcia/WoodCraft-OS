import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { calculateHardwareBom } from "@/lib/hardware-bom";
import { apiError, ok } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const url = new URL(req.url);
  const roomIds = url.searchParams.getAll("roomId");

  const bom = await calculateHardwareBom(params.id, orgId, roomIds.length ? roomIds : undefined);
  return ok(bom);
}

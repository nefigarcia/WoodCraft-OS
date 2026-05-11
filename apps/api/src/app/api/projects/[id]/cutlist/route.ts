import { NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { buildCutlist } from "@/lib/cutlist";
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

  const cutlist = await buildCutlist(params.id, orgId, roomIds.length ? roomIds : undefined);
  return ok(cutlist);
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, createRoomSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

async function assertProjectOwnership(projectId: string, orgId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, orgId } });
  if (!project) return null;
  return project;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  if (!await assertProjectOwnership(params.id, orgId)) {
    return apiError("Project not found", 404);
  }

  const rooms = await prisma.room.findMany({
    where: { projectId: params.id, orgId },
    include: { _count: { select: { cabinets: true } } },
    orderBy: { createdAt: "asc" },
  });

  return ok(rooms);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  if (!await assertProjectOwnership(params.id, orgId)) {
    return apiError("Project not found", 404);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createRoomSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const room = await prisma.room.create({
    data: { ...parsed.data, projectId: params.id, orgId },
    include: { _count: { select: { cabinets: true } } },
  });

  return ok(room, 201);
}

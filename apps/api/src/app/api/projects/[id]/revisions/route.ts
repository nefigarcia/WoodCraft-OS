import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createRevisionSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const [revisions, total] = await prisma.$transaction([
    prisma.revision.findMany({
      where: { projectId: params.id, orgId },
      skip,
      take,
      orderBy: { version: "desc" },
      // Explicitly select every field except snapshot — it can be several MB per row
      select: {
        id: true,
        projectId: true,
        orgId: true,
        userId: true,
        version: true,
        message: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.revision.count({ where: { projectId: params.id, orgId } }),
  ]);

  return ok({
    data: revisions,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId, userId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createRevisionSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  // Capture the full current state: all rooms → cabinets → parts
  const snapshot = await prisma.room.findMany({
    where: { projectId: params.id, orgId },
    include: {
      cabinets: {
        include: { parts: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Auto-increment version number
  const latest = await prisma.revision.findFirst({
    where: { projectId: params.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  await prisma.revision.create({
    data: {
      projectId: params.id,
      orgId,
      userId,
      version,
      snapshot: snapshot as never,
      message: parsed.data.message,
    },
  });

  // Return the revision without the snapshot body
  const revision = await prisma.revision.findFirst({
    where: { projectId: params.id, version },
    select: {
      id: true,
      projectId: true,
      orgId: true,
      userId: true,
      version: true,
      message: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return ok(revision, 201);
}

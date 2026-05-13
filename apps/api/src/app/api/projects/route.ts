import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createProjectSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const url = new URL(req.url);
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const clientId = url.searchParams.get("clientId");

  const where = {
    orgId,
    ...(search && { name: { contains: search } }),
    ...(status && { status }),
    ...(clientId && { clientId }),
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { id: true, name: true, email: true } },
        _count: { select: { rooms: true, quotes: true } },
      },
    }),
    prisma.project.count({ where }),
  ]);

  return ok({ data: projects, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(req: NextRequest) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createProjectSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  // Verify client belongs to this org
  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, orgId },
  });
  if (!client) return apiError("Client not found", 404);

  const project = await prisma.project.create({
    data: { ...parsed.data, orgId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      _count: { select: { rooms: true, quotes: true } },
    },
  });

  return ok(project, 201);
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createFeedbackSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const url = new URL(req.url);
  const resolved = url.searchParams.get("resolved");

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const where = {
    orgId,
    projectId: params.id,
    ...(resolved !== null && { resolved: resolved === "true" }),
  };

  const [feedback, total] = await prisma.$transaction([
    prisma.installerFeedback.findMany({
      where,
      skip,
      take,
      orderBy: [{ resolved: "asc" }, { createdAt: "desc" }],
    }),
    prisma.installerFeedback.count({ where }),
  ]);

  return ok({ data: feedback, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createFeedbackSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  if (parsed.data.cabinetId) {
    const cab = await prisma.cabinet.findFirst({ where: { id: parsed.data.cabinetId, orgId } });
    if (!cab) return apiError("Cabinet not found", 404);
  }

  const feedback = await prisma.installerFeedback.create({
    data: {
      orgId,
      projectId: params.id,
      cabinetId: parsed.data.cabinetId ?? null,
      reportedBy: parsed.data.reportedBy,
      severity: parsed.data.severity,
      category: parsed.data.category,
      description: parsed.data.description,
      photoUrls: parsed.data.photoUrls
        ? (parsed.data.photoUrls as unknown as import("@prisma/client").Prisma.InputJsonValue)
        : undefined,
    },
  });

  return ok(feedback, 201);
}

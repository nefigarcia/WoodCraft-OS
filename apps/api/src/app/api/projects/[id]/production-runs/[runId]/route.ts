import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateProductionRunSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; runId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateProductionRunSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const existing = await prisma.productionRun.findFirst({
    where: { id: params.runId, projectId: params.id, orgId },
  });
  if (!existing) return apiError("Production run not found", 404);

  // Auto-set timestamps based on status transitions
  const now = new Date();
  const statusTimestamps: Record<string, Date | null> = {};
  if (parsed.data.status === "in_progress" && !existing.startedAt) {
    statusTimestamps["startedAt"] = now;
  }
  if (parsed.data.status === "complete" && !existing.completedAt) {
    statusTimestamps["completedAt"] = now;
  }

  const updated = await prisma.productionRun.update({
    where: { id: params.runId },
    data: {
      ...parsed.data,
      ...statusTimestamps,
      scheduledAt: parsed.data.scheduledAt
        ? new Date(parsed.data.scheduledAt)
        : parsed.data.scheduledAt === null ? null : undefined,
    },
  });

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);
  const existing = await prisma.productionRun.findFirst({
    where: { id: params.runId, projectId: params.id, orgId },
  });
  if (!existing) return apiError("Production run not found", 404);
  await prisma.productionRun.delete({ where: { id: params.runId } });
  return ok({ id: params.runId });
}

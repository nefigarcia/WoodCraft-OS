import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateFeedbackSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; feedbackId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateFeedbackSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const existing = await prisma.installerFeedback.findFirst({
    where: { id: params.feedbackId, projectId: params.id, orgId },
  });
  if (!existing) return apiError("Feedback not found", 404);

  const updated = await prisma.installerFeedback.update({
    where: { id: params.feedbackId },
    data: {
      ...parsed.data,
      resolvedAt: parsed.data.resolved ? new Date() : undefined,
    },
  });

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const existing = await prisma.installerFeedback.findFirst({
    where: { id: params.feedbackId, projectId: params.id, orgId },
  });
  if (!existing) return apiError("Feedback not found", 404);

  await prisma.installerFeedback.delete({ where: { id: params.feedbackId } });
  return ok({ id: params.feedbackId });
}

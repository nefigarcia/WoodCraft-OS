import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateTeamMemberSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { orgId, userId: callerId, role: callerRole } = getContext(req);

  if (callerRole !== "owner" && callerRole !== "admin") {
    return apiError("Only owners and admins can change roles", 403, "FORBIDDEN");
  }
  if (params.userId === callerId) {
    return apiError("Cannot change your own role", 400);
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateTeamMemberSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const target = await prisma.user.findFirst({ where: { id: params.userId, orgId } });
  if (!target) return apiError("User not found", 404);

  // Only owners can change another owner's role
  if (target.role === "owner" && callerRole !== "owner") {
    return apiError("Only owners can change another owner's role", 403, "FORBIDDEN");
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: { role: parsed.data.role },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
  });

  return ok(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const { orgId, userId: callerId, role: callerRole } = getContext(req);

  if (callerRole !== "owner" && callerRole !== "admin") {
    return apiError("Only owners and admins can remove members", 403, "FORBIDDEN");
  }
  if (params.userId === callerId) {
    return apiError("Cannot remove yourself", 400);
  }

  const target = await prisma.user.findFirst({ where: { id: params.userId, orgId } });
  if (!target) return apiError("User not found", 404);

  // Prevent removing the last owner
  if (target.role === "owner") {
    const ownerCount = await prisma.user.count({ where: { orgId, role: "owner" } });
    if (ownerCount <= 1) return apiError("Cannot remove the last owner", 400);
  }

  await prisma.user.delete({ where: { id: params.userId } });
  return ok({ id: params.userId });
}

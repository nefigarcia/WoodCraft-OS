import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, inviteTeamMemberSchema } from "@/lib/validate";
import { hashPassword } from "@/lib/auth";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);

  const members = await prisma.user.findMany({
    where: { orgId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return ok(members);
}

export async function POST(req: NextRequest) {
  const { orgId, role: callerRole } = getContext(req);

  if (callerRole !== "owner" && callerRole !== "admin") {
    return apiError("Only owners and admins can invite team members", 403, "FORBIDDEN");
  }

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(inviteTeamMemberSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return apiError("Email is already registered", 409, "EMAIL_EXISTS");

  const passwordHash = await hashPassword(parsed.data.temporaryPassword);

  const member = await prisma.user.create({
    data: {
      orgId,
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      createdAt: true,
    },
  });

  return ok(member, 201);
}

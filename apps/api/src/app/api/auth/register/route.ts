import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  hashToken,
  signAccessToken,
  signRefreshToken,
  makeOrgSlug,
} from "@/lib/auth";
import { parseBody, registerSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = parseBody(registerSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const { email, password, firstName, lastName, orgName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return apiError("Email is already registered", 409, "EMAIL_EXISTS");
  }

  const passwordHash = await hashPassword(password);

  // Create org + owner user in a single transaction
  const org = await prisma.organization.create({
    data: {
      name: orgName,
      slug: makeOrgSlug(orgName),
      users: {
        create: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: "owner",
        },
      },
    },
    include: { users: true },
  });

  const user = org.users[0]!;

  const tokenPayload = {
    userId: user.id,
    orgId: org.id,
    role: user.role as "owner",
    email: user.email,
  };
  const accessToken = await signAccessToken(tokenPayload);
  const refreshToken = await signRefreshToken(tokenPayload);
  const refreshTokenHash = await hashToken(refreshToken);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshTokenHash, lastLoginAt: new Date() },
  });

  return ok(
    {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        orgId: org.id,
      },
      org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
      accessToken,
      refreshToken,
    },
    201
  );
}

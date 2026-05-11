import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  comparePassword,
  hashToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth";
import { parseBody, loginSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = parseBody(loginSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { org: { select: { id: true, name: true, slug: true, plan: true } } },
  });

  // Constant-time rejection: always run comparePassword even on miss
  const passwordMatch = user
    ? await comparePassword(password, user.passwordHash)
    : await comparePassword(password, "$2b$12$invalidhashpadding000000000000000"); // dummy hash

  if (!user || !passwordMatch) {
    return apiError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const tokenPayload = {
    userId: user.id,
    orgId: user.orgId,
    role: user.role as "owner" | "admin" | "designer" | "viewer",
    email: user.email,
  };
  const accessToken = await signAccessToken(tokenPayload);
  const refreshToken = await signRefreshToken(tokenPayload);
  const refreshTokenHash = await hashToken(refreshToken);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshTokenHash, lastLoginAt: new Date() },
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      orgId: user.orgId,
    },
    org: user.org,
    accessToken,
    refreshToken,
  });
}

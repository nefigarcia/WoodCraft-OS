import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyRefreshToken,
  compareToken,
  hashToken,
  signAccessToken,
  signRefreshToken,
} from "@/lib/auth";
import { parseBody, refreshSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const parsed = parseBody(refreshSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const { refreshToken } = parsed.data;

  // 1. Verify JWT signature and extract userId
  let userId: string;
  try {
    const payload = await verifyRefreshToken(refreshToken);
    userId = payload.userId;
  } catch {
    return apiError("Invalid or expired refresh token", 401, "TOKEN_INVALID");
  }

  // 2. Load user and compare incoming token against stored hash
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      orgId: true,
      refreshToken: true,
    },
  });

  if (!user || !user.refreshToken) {
    return apiError("Invalid refresh token", 401, "TOKEN_INVALID");
  }

  const tokenMatches = await compareToken(refreshToken, user.refreshToken);
  if (!tokenMatches) {
    // Possible token reuse — clear stored token (rotation violation)
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return apiError("Refresh token reuse detected", 401, "TOKEN_REUSE");
  }

  // 3. Issue new token pair (rotation — old token is invalidated)
  const tokenPayload = {
    userId: user.id,
    orgId: user.orgId,
    role: user.role as "owner" | "admin" | "designer" | "viewer",
    email: user.email,
  };
  const newAccessToken = await signAccessToken(tokenPayload);
  const newRefreshToken = await signRefreshToken(tokenPayload);
  const newRefreshHash = await hashToken(newRefreshToken);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: newRefreshHash },
  });

  return ok({ accessToken: newAccessToken, refreshToken: newRefreshToken });
}

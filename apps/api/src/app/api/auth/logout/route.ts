import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/errors";

// Middleware already verified the token and set x-user-id header.
export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return ok({ message: "Logged out" }); // already unauthorised

  // Clear stored refresh token — invalidates any outstanding refresh tokens
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });

  return ok({ message: "Logged out successfully" });
}

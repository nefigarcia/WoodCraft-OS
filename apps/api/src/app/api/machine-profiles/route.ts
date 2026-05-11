import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, createMachineProfileSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);
  const profiles = await prisma.machineProfile.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });
  return ok(profiles);
}

export async function POST(req: NextRequest) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createMachineProfileSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const profile = await prisma.machineProfile.create({ data: { ...parsed.data, orgId } });
  return ok(profile, 201);
}

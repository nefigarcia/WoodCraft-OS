import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createHardwareSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const search = url.searchParams.get("search");

  const where = {
    orgId,
    ...(type && { type }),
    ...(search && { name: { contains: search } }),
  };

  const [hardware, total] = await prisma.$transaction([
    prisma.hardware.findMany({ where, skip, take, orderBy: { name: "asc" } }),
    prisma.hardware.count({ where }),
  ]);

  return ok({ data: hardware, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(req: NextRequest) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createHardwareSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const hardware = await prisma.hardware.create({ data: { ...parsed.data, orgId } as never });
  return ok(hardware, 201);
}

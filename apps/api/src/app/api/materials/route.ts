import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createMaterialSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  const where = { orgId, ...(type && { type }) };

  const [materials, total] = await prisma.$transaction([
    prisma.material.findMany({ where, skip, take, orderBy: { name: "asc" } }),
    prisma.material.count({ where }),
  ]);

  return ok({ data: materials, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(req: NextRequest) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createMaterialSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const material = await prisma.material.create({ data: { ...parsed.data, orgId } });
  return ok(material, 201);
}

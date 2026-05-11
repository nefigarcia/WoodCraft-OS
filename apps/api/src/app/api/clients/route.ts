import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createClientSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const url = new URL(req.url);
  const search = url.searchParams.get("search");

  const where = {
    orgId,
    ...(search && {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
      ],
    }),
  };

  const [clients, total] = await prisma.$transaction([
    prisma.client.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.client.count({ where }),
  ]);

  return ok({ data: clients, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(req: NextRequest) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createClientSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const client = await prisma.client.create({
    data: { ...parsed.data, orgId },
  });

  return ok(client, 201);
}

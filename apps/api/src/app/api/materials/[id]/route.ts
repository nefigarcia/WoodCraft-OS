import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateMaterialSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = getContext(req);
  const m = await prisma.material.findFirst({ where: { id: params.id, orgId } });
  if (!m) return apiError("Material not found", 404);
  return ok(m);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateMaterialSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const existing = await prisma.material.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return apiError("Material not found", 404);

  const updated = await prisma.material.update({ where: { id: params.id }, data: parsed.data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { orgId } = getContext(req);
  const existing = await prisma.material.findFirst({ where: { id: params.id, orgId } });
  if (!existing) return apiError("Material not found", 404);
  await prisma.material.delete({ where: { id: params.id } });
  return ok({ id: params.id });
}

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext, getPagination } from "@/lib/context";
import { parseBody, createQuoteSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

function computeTotals(
  lineItems: { qty: number; unitPrice: number }[],
  taxRate: number
) {
  const subtotal = lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  return { subtotal, taxAmount, total };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);
  const { skip, take, page, pageSize } = getPagination(req);

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const [quotes, total] = await prisma.$transaction([
    prisma.quote.findMany({
      where: { projectId: params.id, orgId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.quote.count({ where: { projectId: params.id, orgId } }),
  ]);

  return ok({ data: quotes, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId, userId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(createQuoteSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const enrichedItems = parsed.data.lineItems.map((item) => ({
    ...item,
    total: item.qty * item.unitPrice,
  }));

  const { subtotal, taxAmount, total } = computeTotals(enrichedItems, parsed.data.taxRate);

  const quote = await prisma.quote.create({
    data: {
      orgId,
      projectId: params.id,
      userId,
      lineItems: enrichedItems as unknown as import("@prisma/client").Prisma.InputJsonValue,
      subtotal,
      taxRate: parsed.data.taxRate,
      taxAmount,
      total,
      notes: parsed.data.notes,
      validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
    },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });

  return ok(quote, 201);
}

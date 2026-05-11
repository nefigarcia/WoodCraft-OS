import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { parseBody, updateQuoteSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; quoteId: string } };

function computeTotals(
  lineItems: { qty: number; unitPrice: number }[],
  taxRate: number
) {
  const subtotal = lineItems.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const taxAmount = subtotal * taxRate;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

async function findQuote(quoteId: string, projectId: string, orgId: string) {
  return prisma.quote.findFirst({ where: { id: quoteId, projectId, orgId } });
}

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);
  const quote = await findQuote(params.quoteId, params.id, orgId);
  if (!quote) return apiError("Quote not found", 404);
  return ok(quote);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(updateQuoteSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const existing = await findQuote(params.quoteId, params.id, orgId);
  if (!existing) return apiError("Quote not found", 404);

  // Recompute totals if line items or tax rate changed
  const lineItems = (
    parsed.data.lineItems ??
    (existing.lineItems as { qty: number; unitPrice: number; description: string }[])
  ).map((i) => ({ ...i, total: i.qty * i.unitPrice }));

  const taxRate = parsed.data.taxRate ?? Number(existing.taxRate);
  const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);

  const updated = await prisma.quote.update({
    where: { id: params.quoteId },
    data: {
      ...parsed.data,
      lineItems: lineItems as unknown as import("@prisma/client").Prisma.InputJsonValue,
      subtotal,
      taxRate,
      taxAmount,
      total,
      validUntil: parsed.data.validUntil
        ? new Date(parsed.data.validUntil)
        : parsed.data.validUntil === null
          ? null
          : undefined,
    },
  });

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);
  const existing = await findQuote(params.quoteId, params.id, orgId);
  if (!existing) return apiError("Quote not found", 404);
  await prisma.quote.delete({ where: { id: params.quoteId } });
  return ok({ id: params.quoteId });
}

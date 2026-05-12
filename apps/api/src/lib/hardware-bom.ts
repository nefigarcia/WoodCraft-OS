/**
 * Hardware BOM calculator.
 * Maps cabinet parameters (doorCount, drawerCount, shelfCount, etc.)
 * to quantities of hardware types, then matches those types to the org's
 * hardware catalogue to compute per-item costs.
 */
import { prisma } from "@/lib/prisma";

interface BomLine {
  hardwareId: string | null;
  name: string;
  type: string;
  sku: string | null;
  qtyNeeded: number;
  costPerUnit: number;
  lineTotal: number;
}

interface BomResult {
  lines: BomLine[];
  totalCost: number;
  unmatchedTypes: string[];
}

// Rules: for each parameter key, which hardware types are needed and at what ratio per unit
const BOM_RULES: Record<string, { type: string; perUnit: number }[]> = {
  doorCount: [
    { type: "hinge", perUnit: 2 },
    { type: "handle", perUnit: 1 },
  ],
  drawerCount: [
    { type: "drawer_slide", perUnit: 2 },
    { type: "handle", perUnit: 1 },
    { type: "soft_close", perUnit: 1 },
  ],
  shelfCount: [
    { type: "shelf_pin", perUnit: 4 },
  ],
};

export async function calculateHardwareBom(
  projectId: string,
  orgId: string,
  roomIds?: string[]
): Promise<BomResult> {
  const roomFilter = roomIds?.length
    ? { projectId, orgId, id: { in: roomIds } }
    : { projectId, orgId };

  const [rooms, catalogue] = await prisma.$transaction([
    prisma.room.findMany({
      where: roomFilter,
      include: { cabinets: { select: { parameters: true } } },
    }),
    prisma.hardware.findMany({ where: { orgId } }),
  ]);

  // Tally quantities needed by hardware type
  const typeQty = new Map<string, number>();

  for (const room of rooms) {
    for (const cabinet of room.cabinets) {
      const params = cabinet.parameters as Record<string, unknown>;
      for (const [paramKey, rules] of Object.entries(BOM_RULES)) {
        const count = Number(params[paramKey] ?? 0);
        if (count <= 0) continue;
        for (const rule of rules) {
          typeQty.set(rule.type, (typeQty.get(rule.type) ?? 0) + count * rule.perUnit);
        }
      }
    }
  }

  const lines: BomLine[] = [];
  const unmatchedTypes: string[] = [];

  for (const [type, qty] of typeQty.entries()) {
    // Find first catalogue item of this type (prefer cheapest if multiple)
    const match = catalogue
      .filter((h) => h.type === type)
      .sort((a, b) => Number(a.costPerUnit) - Number(b.costPerUnit))[0];

    if (match) {
      const costPerUnit = Number(match.costPerUnit);
      lines.push({
        hardwareId: match.id,
        name: match.name,
        type,
        sku: match.sku,
        qtyNeeded: qty,
        costPerUnit,
        lineTotal: qty * costPerUnit,
      });
    } else {
      unmatchedTypes.push(type);
      lines.push({
        hardwareId: null,
        name: `${type.replace(/_/g, " ")} (no catalogue match)`,
        type,
        sku: null,
        qtyNeeded: qty,
        costPerUnit: 0,
        lineTotal: 0,
      });
    }
  }

  lines.sort((a, b) => a.type.localeCompare(b.type));

  return {
    lines,
    totalCost: lines.reduce((s, l) => s + l.lineTotal, 0),
    unmatchedTypes,
  };
}

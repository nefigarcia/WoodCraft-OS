/**
 * Syncs cabinet parts in the DB from a cad-service geometry response.
 * Runs in a transaction: deletes all existing parts, inserts fresh set.
 * Returns the newly created parts.
 */
import { prisma } from "@/lib/prisma";
import type { CadPart } from "@/lib/services";
import type { Prisma } from "@woodcraft/db";

export async function syncParts(
  cabinetId: string,
  orgId: string,
  cadParts: CadPart[]
): Promise<Prisma.CabinetPartGetPayload<Record<string, never>>[]> {
  await prisma.$transaction([
    prisma.cabinetPart.deleteMany({ where: { cabinetId } }),
    prisma.cabinetPart.createMany({
      data: cadParts.map((p) => ({
        cabinetId,
        orgId,
        name: p.name,
        partType: p.part_type,
        width: p.width,
        height: p.height,
        thickness: p.thickness,
        quantity: p.quantity,
        grainDir: p.grain_dir ?? null,
        edgeBanding: p.edge_banding
          ? (p.edge_banding as any)
          : undefined,
        cutParams: p.cut_params
          ? (p.cut_params as any)
          : undefined,
      })),
    }),
  ]);

  return prisma.cabinetPart.findMany({
    where: { cabinetId },
    orderBy: { partType: "asc" },
  });
}

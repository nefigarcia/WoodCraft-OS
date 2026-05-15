/**
 * Syncs cabinet parts from a cad-service geometry response.
 * Manual parts (isManual=true) are preserved across recomputes — they survive
 * geometry changes and must be explicitly deleted by the user.
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
    // Delete only CAD-computed parts; manual parts survive
    prisma.cabinetPart.deleteMany({ where: { cabinetId, isManual: false } }),
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
        edgeBanding: p.edge_banding ? (p.edge_banding as Prisma.InputJsonValue) : undefined,
        cutParams: p.cut_params ? (p.cut_params as Prisma.InputJsonValue) : undefined,
        assemblyGroup: p.assembly_group ?? null,
        isManual: false,
      })),
    }),
  ]);

  return prisma.cabinetPart.findMany({
    where: { cabinetId },
    orderBy: [{ isManual: "asc" }, { assemblyGroup: "asc" }, { partType: "asc" }],
  });
}

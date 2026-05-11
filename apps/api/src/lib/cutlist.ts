/**
 * Cut list aggregation logic.
 * Pulls all cabinet parts across all rooms in a project, groups by material,
 * and estimates sheet counts with a 75% nesting efficiency assumption.
 */
import { prisma } from "@/lib/prisma";

export interface CutlistRow {
  partId: string;
  roomName: string;
  cabinetName: string;
  cabinetType: string;
  partName: string;
  partType: string;
  width: number;
  height: number;
  thickness: number;
  quantity: number;
  materialId: string | null;
  materialName: string | null;
  materialType: string | null;
  sheetWidth: number | null;
  sheetHeight: number | null;
  costPerSheet: number | null;
  grainDir: string | null;
  edgeBanding: Record<string, boolean> | null;
}

export interface MaterialGroup {
  materialId: string | null;
  materialName: string;
  materialType: string | null;
  thickness: number;
  sheetWidth: number | null;
  sheetHeight: number | null;
  costPerSheet: number | null;
  rows: CutlistRow[];
  totalPieces: number;
  estimatedSheets: number;
  estimatedMaterialCost: number;
}

export interface CutlistResult {
  projectId: string;
  rows: CutlistRow[];
  byMaterial: MaterialGroup[];
  summary: {
    totalParts: number;
    totalPieces: number;
    estimatedMaterialCost: number;
  };
}

const NESTING_EFFICIENCY = 0.75;

export async function buildCutlist(
  projectId: string,
  orgId: string,
  roomIds?: string[]
): Promise<CutlistResult> {
  const roomFilter = roomIds?.length
    ? { projectId, orgId, id: { in: roomIds } }
    : { projectId, orgId };

  const rooms = await prisma.room.findMany({
    where: roomFilter,
    include: {
      cabinets: {
        include: {
          parts: {
            include: { material: true },
          },
          material: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: CutlistRow[] = [];

  for (const room of rooms) {
    for (const cabinet of room.cabinets) {
      for (const part of cabinet.parts) {
        // Part-level material overrides cabinet-level material
        const mat = part.material ?? cabinet.material;
        rows.push({
          partId: part.id,
          roomName: room.name,
          cabinetName: cabinet.name,
          cabinetType: cabinet.type,
          partName: part.name,
          partType: part.partType,
          width: Number(part.width),
          height: Number(part.height),
          thickness: Number(part.thickness),
          quantity: part.quantity,
          materialId: mat?.id ?? null,
          materialName: mat?.name ?? null,
          materialType: mat?.type ?? null,
          sheetWidth: mat ? Number(mat.sheetWidth) : null,
          sheetHeight: mat ? Number(mat.sheetHeight) : null,
          costPerSheet: mat ? Number(mat.costPerSheet) : null,
          grainDir: part.grainDir,
          edgeBanding: part.edgeBanding as Record<string, boolean> | null,
        });
      }
    }
  }

  // Group by material
  const matMap = new Map<string, MaterialGroup>();

  for (const row of rows) {
    const key = row.materialId ?? "__unassigned__";
    if (!matMap.has(key)) {
      matMap.set(key, {
        materialId: row.materialId,
        materialName: row.materialName ?? "Unassigned",
        materialType: row.materialType,
        thickness: row.thickness,
        sheetWidth: row.sheetWidth,
        sheetHeight: row.sheetHeight,
        costPerSheet: row.costPerSheet,
        rows: [],
        totalPieces: 0,
        estimatedSheets: 0,
        estimatedMaterialCost: 0,
      });
    }
    const group = matMap.get(key)!;
    group.rows.push(row);
    group.totalPieces += row.quantity;
  }

  // Calculate sheet estimates per material group
  for (const group of matMap.values()) {
    if (group.sheetWidth && group.sheetHeight) {
      const totalArea = group.rows.reduce(
        (sum, r) => sum + r.width * r.height * r.quantity,
        0
      );
      const sheetArea = group.sheetWidth * group.sheetHeight * NESTING_EFFICIENCY;
      group.estimatedSheets = Math.ceil(totalArea / sheetArea);
      group.estimatedMaterialCost = group.costPerSheet
        ? group.estimatedSheets * group.costPerSheet
        : 0;
    }
  }

  const byMaterial = [...matMap.values()];

  return {
    projectId,
    rows,
    byMaterial,
    summary: {
      totalParts: rows.length,
      totalPieces: rows.reduce((s, r) => s + r.quantity, 0),
      estimatedMaterialCost: byMaterial.reduce((s, m) => s + m.estimatedMaterialCost, 0),
    },
  };
}

export function toCsv(result: CutlistResult): string {
  const header = [
    "Room",
    "Cabinet",
    "Cabinet Type",
    "Part",
    "Part Type",
    "Width (mm)",
    "Height (mm)",
    "Thickness (mm)",
    "Qty",
    "Material",
    "Grain Dir",
    "EB Top",
    "EB Bottom",
    "EB Left",
    "EB Right",
  ].join(",");

  const lines = result.rows.map((r) => {
    const eb = r.edgeBanding ?? {};
    return [
      `"${r.roomName}"`,
      `"${r.cabinetName}"`,
      r.cabinetType,
      `"${r.partName}"`,
      r.partType,
      r.width,
      r.height,
      r.thickness,
      r.quantity,
      `"${r.materialName ?? ""}"`,
      r.grainDir ?? "none",
      eb["top"] ? "Y" : "N",
      eb["bottom"] ? "Y" : "N",
      eb["left"] ? "Y" : "N",
      eb["right"] ? "Y" : "N",
    ].join(",");
  });

  return [header, ...lines].join("\r\n");
}

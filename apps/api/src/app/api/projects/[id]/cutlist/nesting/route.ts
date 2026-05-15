import { NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { buildCutlist } from "@/lib/cutlist";
import { cadService } from "@/lib/services";
import { apiError, ok } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const url = new URL(req.url);
  const roomIds = url.searchParams.getAll("roomId");

  const cutlist = await buildCutlist(params.id, orgId, roomIds.length ? roomIds : undefined);

  if (cutlist.rows.length === 0) {
    return ok({ sheets: [] });
  }

  // Compute nesting per material group using its sheet dims (or standard 4×8 fallback)
  const sheets = await Promise.all(
    cutlist.byMaterial.map(async (group) => {
      const sheetWidth = group.sheetWidth ?? 1220;
      const sheetHeight = group.sheetHeight ?? 2440;

      const parts = group.rows.map((r) => ({
        id: r.partId,
        name: r.partName,
        width: r.width,
        height: r.height,
        quantity: r.quantity,
      }));

      const result = await cadService
        .computeNesting({ parts, sheet_width: sheetWidth, sheet_height: sheetHeight })
        .catch((err: unknown) => {
          console.error("[nesting] computeNesting failed:", err);
          return null;
        });

      return {
        materialId: group.materialId,
        materialName: group.materialName,
        sheetWidth,
        sheetHeight,
        totalSheets: result?.total_sheets ?? 0,
        overallEfficiency: result?.overall_efficiency ?? 0,
        svg: result?.svg ?? null,
      };
    })
  );

  return ok({ sheets });
}

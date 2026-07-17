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

      // Drop parts with non-positive dimensions before sending — the CAD service
      // will happily nest a 0×0 rect but the resulting SVG is degenerate.
      const parts = group.rows
        .filter((r) => r.width > 0 && r.height > 0 && r.quantity > 0)
        .map((r) => ({
          id: r.partId,
          name: r.partName,
          width: r.width,
          height: r.height,
          quantity: r.quantity,
        }));

      const skipped = group.rows.length - parts.length;

      if (parts.length === 0) {
        return {
          materialId: group.materialId,
          materialName: group.materialName,
          sheetWidth, sheetHeight,
          totalSheets: 0, overallEfficiency: 0, svg: null,
          error: `No valid parts in this material group (${group.rows.length} skipped due to zero/negative dimensions)`,
        };
      }

      let errorMsg: string | null = null;
      const result = await cadService
        .computeNesting({ parts, sheet_width: sheetWidth, sheet_height: sheetHeight })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          errorMsg = msg;
          console.error(`[nesting] computeNesting failed for group ${group.materialName ?? "unassigned"} (${parts.length} parts):`, msg);
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
        error: errorMsg ?? (skipped > 0 ? `${skipped} part(s) skipped (invalid dimensions)` : null),
      };
    })
  );

  return ok({ sheets });
}

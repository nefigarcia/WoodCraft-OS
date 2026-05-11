import { NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { buildCutlist, toCsv } from "@/lib/cutlist";
import { apiError } from "@/lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const cutlist = await buildCutlist(params.id, orgId);
  const csv = toCsv(cutlist);
  const filename = `cutlist-${project.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

import { NextRequest } from "next/server";
import { getContext } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { cncService } from "@/lib/services";
import { buildCutlist } from "@/lib/cutlist";
import { parseBody, cncExportSchema } from "@/lib/validate";
import { apiError, ok } from "@/lib/errors";
import { randomUUID } from "node:crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { orgId } = getContext(req);

  let body: unknown;
  try { body = await req.json(); } catch { return apiError("Invalid JSON body", 400); }

  const parsed = parseBody(cncExportSchema, body);
  if (!parsed.success) return apiError(parsed.error, 422, "VALIDATION_ERROR");

  const project = await prisma.project.findFirst({ where: { id: params.id, orgId } });
  if (!project) return apiError("Project not found", 404);

  const machineProfile = await prisma.machineProfile.findFirst({
    where: { id: parsed.data.machineProfileId, orgId },
  });
  if (!machineProfile) return apiError("Machine profile not found", 404);

  const cutlist = await buildCutlist(
    params.id,
    orgId,
    parsed.data.roomIds
  );

  if (cutlist.rows.length === 0) {
    return apiError("No parts to export. Add cabinets to your project first.", 422);
  }

  const jobId = randomUUID();

  // Map cut list rows to the shape cnc-service expects
  const parts = cutlist.rows.map((r) => ({
    name: `${r.cabinetName} - ${r.partName}`,
    width: r.width,
    height: r.height,
    thickness: r.thickness,
    quantity: r.quantity,
  }));

  let gcodeResult: { jobId: string; gcode: string; lineCount: number } | null = null;
  let dxfResult: { jobId: string; dxf: string; partCount: number } | null = null;

  if (parsed.data.format === "gcode" || parsed.data.format === "both") {
    gcodeResult = await cncService
      .generateGcode({
        jobId,
        machineProfile: {
          postProcessor: machineProfile.postProcessor,
          config: machineProfile.config as Record<string, unknown>,
        },
        parts,
      })
      .catch((err: unknown) => {
        console.error("[cnc-service] G-code error:", err);
        return null;
      });
  }

  // For DXF we call the cnc-service DXF endpoint via a direct fetch
  if (parsed.data.format === "dxf" || parsed.data.format === "both") {
    const cncUrl = process.env.CNC_SERVICE_URL ?? "http://localhost:8003";
    const dxfRes = await fetch(`${cncUrl}/dxf/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": process.env.INTERNAL_API_KEY ?? "",
      },
      body: JSON.stringify({ jobId, parts }),
    }).catch(() => null);
    if (dxfRes?.ok) {
      dxfResult = (await dxfRes.json()) as { jobId: string; dxf: string; partCount: number };
    }
  }

  // Persist the CNC job record
  const cncJob = await prisma.cncJob.create({
    data: {
      orgId,
      projectId: params.id,
      machineProfileId: machineProfile.id,
      status: gcodeResult || dxfResult ? "complete" : "failed",
      errorMessage: !gcodeResult && !dxfResult ? "cnc-service unavailable" : null,
    },
  });

  return ok({
    jobId: cncJob.id,
    status: cncJob.status,
    partCount: parts.length,
    gcode: gcodeResult?.gcode ?? null,
    gcodeLineCount: gcodeResult?.lineCount ?? null,
    dxf: dxfResult?.dxf ?? null,
    dxfPartCount: dxfResult?.partCount ?? null,
  });
}

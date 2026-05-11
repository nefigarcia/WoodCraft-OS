import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

type Params = { params: { id: string; revisionId: string } };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = getContext(req);

  const revision = await prisma.revision.findFirst({
    where: { id: params.revisionId, projectId: params.id, orgId },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!revision) return apiError("Revision not found", 404);

  return ok(revision);
}

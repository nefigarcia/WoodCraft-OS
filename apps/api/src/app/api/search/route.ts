import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { apiError, ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 2) return apiError("Query must be at least 2 characters", 400);

  const [projects, clients, cabinets] = await prisma.$transaction([
    prisma.project.findMany({
      where: { orgId, name: { contains: q } },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        client: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      where: {
        orgId,
        OR: [{ name: { contains: q } }, { email: { contains: q } }],
      },
      take: 5,
      select: { id: true, name: true, email: true },
    }),
    prisma.cabinet.findMany({
      where: { orgId, name: { contains: q } },
      take: 5,
      select: {
        id: true,
        name: true,
        type: true,
        room: {
          select: { id: true, name: true, projectId: true },
        },
      },
    }),
  ]);

  const total = projects.length + clients.length + cabinets.length;
  return ok({ query: q, total, projects, clients, cabinets });
}

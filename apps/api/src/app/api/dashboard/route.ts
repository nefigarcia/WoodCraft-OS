import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    activeProjects,
    openQuotes,
    pendingFeedback,
    cncJobsThisMonth,
    recentProjects,
    recentFeedback,
  ] = await prisma.$transaction([
    prisma.project.count({
      where: { orgId, status: { notIn: ["complete"] } },
    }),
    prisma.quote.count({
      where: { orgId, status: { in: ["draft", "sent"] } },
    }),
    prisma.installerFeedback.count({
      where: { orgId, resolved: false },
    }),
    prisma.cncJob.count({
      where: { orgId, createdAt: { gte: monthStart } },
    }),
    prisma.project.findMany({
      where: { orgId },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        client: { select: { id: true, name: true } },
        _count: { select: { rooms: true } },
      },
    }),
    prisma.installerFeedback.findMany({
      where: { orgId, resolved: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        projectId: true,
        reportedBy: true,
        severity: true,
        category: true,
        description: true,
        createdAt: true,
      },
    }),
  ]);

  return ok({
    stats: { activeProjects, openQuotes, pendingFeedback, cncJobsThisMonth },
    recentProjects,
    recentFeedback,
  });
}

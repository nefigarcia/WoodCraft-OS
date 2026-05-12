import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/context";
import { ok } from "@/lib/errors";

export async function GET(req: NextRequest) {
  const { orgId } = getContext(req);

  const url = new URL(req.url);
  // Client passes its lastSeenAt timestamp so we only return newer items
  const since = url.searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [feedback, quotes] = await prisma.$transaction([
    prisma.installerFeedback.findMany({
      where: { orgId, resolved: false, createdAt: { gt: sinceDate } },
      orderBy: { createdAt: "desc" },
      take: 10,
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
    prisma.quote.findMany({
      where: { orgId, status: { in: ["accepted", "rejected"] }, updatedAt: { gt: sinceDate } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        projectId: true,
        status: true,
        total: true,
        updatedAt: true,
      },
    }),
  ]);

  const total = feedback.length + quotes.length;

  return ok({
    total,
    feedback: feedback.map((f) => ({
      ...f,
      kind: "feedback" as const,
      title: `${f.severity} — ${f.category.replace(/_/g, " ")}`,
      body: f.description.slice(0, 80),
      href: `/projects/${f.projectId}/feedback`,
      at: f.createdAt,
    })),
    quotes: quotes.map((q) => ({
      ...q,
      kind: "quote" as const,
      title: `Quote ${q.status}`,
      body: `$${Number(q.total).toFixed(2)}`,
      href: `/projects/${q.projectId}/quotes`,
      at: q.updatedAt,
    })),
  });
}

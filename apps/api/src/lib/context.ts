import { NextRequest } from "next/server";

export interface RequestContext {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

export function getContext(req: NextRequest): RequestContext {
  return {
    userId: req.headers.get("x-user-id")!,
    orgId: req.headers.get("x-org-id")!,
    role: req.headers.get("x-user-role")!,
    email: req.headers.get("x-user-email")!,
  };
}

export function getPagination(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

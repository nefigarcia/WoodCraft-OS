import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/health",
];

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

// Encode the secret once at module load — Edge runtime has TextEncoder.
const accessKey = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? ""
);

function applyCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization");
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }));
  }

  if (!pathname.startsWith("/api/")) return applyCors(NextResponse.next());

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)))
    return applyCors(NextResponse.next());

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return applyCors(
      NextResponse.json({ error: "Missing authorization header" }, { status: 401 })
    );
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, accessKey);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload["userId"] as string);
    requestHeaders.set("x-org-id", payload["orgId"] as string);
    requestHeaders.set("x-user-role", payload["role"] as string);
    requestHeaders.set("x-user-email", payload["email"] as string);

    return applyCors(NextResponse.next({ request: { headers: requestHeaders } }));
  } catch {
    return applyCors(
      NextResponse.json(
        { error: "Invalid or expired token", code: "TOKEN_INVALID" },
        { status: 401 }
      )
    );
  }
}

export const config = {
  matcher: "/api/:path*",
};

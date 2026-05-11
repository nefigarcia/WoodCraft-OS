import { ok } from "@/lib/errors";

export async function GET() {
  return ok({ status: "ok", service: "woodcraft-api", timestamp: new Date().toISOString() });
}

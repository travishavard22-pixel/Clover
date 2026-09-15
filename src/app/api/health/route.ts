import { db } from "@/lib/db";
import { publicCapabilities } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }
  return Response.json({ status: database === "ok" ? "ok" : "degraded", database, capabilities: publicCapabilities(), time: new Date().toISOString() });
}

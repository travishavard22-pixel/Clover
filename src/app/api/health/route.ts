import { withPublic } from "@/lib/api";
import { db } from "@/lib/db";
import { publicCapabilities } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness for load balancers and the deploy runbook. Capabilities are the same booleans the UI shows. */
export const GET = withPublic(
  async () => {
    let database = "ok";
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      database = "unreachable";
    }
    return Response.json({ status: database === "ok" ? "ok" : "degraded", database, capabilities: publicCapabilities(), time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  },
  { rateLimit: { key: "health", limit: 120, windowSeconds: 60 } },
);

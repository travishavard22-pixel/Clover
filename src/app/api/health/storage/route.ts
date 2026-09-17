import { withUser } from "@/lib/api";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Round-trips a tiny object through the configured storage driver and reports what broke.
 *
 * A misconfigured bucket is otherwise invisible from outside the container: uploads fail deep inside
 * a request or the demo seed, and the only record is a line in the host's log. This does the same
 * put/get/delete an upload does and returns the driver's own error, so the driver can be diagnosed
 * from the deployment itself.
 *
 * Sign-in required: the error text carries bucket and endpoint details that should not be public.
 */
export const GET = withUser(async (_req, { user }) => {
  const key = `health/storage-probe-${user.id}-${Date.now()}.txt`;
  const payload = Buffer.from("clover storage probe");
  const steps: Record<string, string> = {};
  let ok = false;

  try {
    await storage.put(key, payload, { contentType: "text/plain" });
    steps["put"] = "ok";
    const got = await storage.get(key);
    steps["get"] = got ? (got.equals(payload) ? "ok" : "mismatch") : "missing";
    ok = steps["get"] === "ok";
  } catch (err) {
    steps["error"] = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  } finally {
    // Never leave probe objects behind, even when the read failed.
    try {
      await storage.delete(key);
      steps["delete"] = "ok";
    } catch (err) {
      steps["delete"] = err instanceof Error ? err.message : String(err);
    }
  }

  return Response.json(
    {
      ok,
      driver: env.STORAGE_DRIVER,
      bucket: env.S3_BUCKET ?? null,
      endpoint: env.S3_ENDPOINT ?? null,
      region: env.S3_REGION,
      steps,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}, { rateLimit: { key: "health-storage", limit: 10, windowSeconds: 60 } });

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getJobEvents } from "@/lib/jobs/queue";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import { requireUserApi } from "@/lib/session";

/** A stream never outlives this; the client reconnects (with Last-Event-ID) if the job is still running. */
const MAX_STREAM_MS = 10 * 60 * 1000;
/** Poll quickly while a job is fresh, then back off — long-running jobs do not need 2 queries a second. */
function pollDelay(elapsedMs: number) {
  return elapsedMs < 60_000 ? 500 : elapsedMs < 5 * 60_000 ? 1500 : 3000;
}

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream of a job's progress. Replays history from `Last-Event-ID` (or ?after=)
 * and then tails new events until the job finishes. Every event is real: it is emitted by the
 * worker as the step actually runs.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUserApi(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const limit = await rateLimit(`jobs.events:user:${user.id}`, 120, 600);
  if (!limit.ok) return new Response("Too many streams. Please slow down.", { status: 429, headers: rateLimitHeaders(limit) });
  const { id } = await ctx.params;
  const job = await db.job.findFirst({ where: { id, userId: user.id } });
  if (!job) return new Response("Not found", { status: 404 });

  const lastId = req.headers.get("last-event-id") ?? req.nextUrl.searchParams.get("after");
  let after = lastId ? Number(lastId) || 0 : 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown, seq?: number) => {
        controller.enqueue(encoder.encode(`${seq !== undefined ? `id: ${seq}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("snapshot", { id: job.id, type: job.type, status: job.status, steps: job.steps });
      let done = false;
      const startedAt = Date.now();
      let lastKeepAlive = startedAt;
      while (!done && !req.signal.aborted && Date.now() - startedAt < MAX_STREAM_MS) {
        const events = await getJobEvents(job.id, after);
        for (const ev of events) {
          after = ev.seq;
          send(ev.kind, { seq: ev.seq, stepKey: ev.stepKey, message: ev.message, data: ev.data, at: ev.createdAt }, ev.seq);
          if (ev.kind === "job_finished" || ev.kind === "job_failed") done = true;
        }
        if (!done) {
          const fresh = await db.job.findUnique({ where: { id: job.id }, select: { status: true, steps: true } });
          if (fresh && (fresh.status === "SUCCEEDED" || fresh.status === "FAILED" || fresh.status === "CANCELLED")) {
            send("snapshot", { id: job.id, status: fresh.status, steps: fresh.steps });
            done = true;
          } else {
            const now = Date.now();
            if (now - lastKeepAlive >= 10_000) {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
              lastKeepAlive = now;
            }
            await new Promise((r) => setTimeout(r, pollDelay(now - startedAt)));
          }
        }
      }
      if (!done && !req.signal.aborted) send("stream_timeout", { id: job.id, message: "Still running — reconnecting." });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

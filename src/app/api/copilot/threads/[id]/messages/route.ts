import { z } from "zod";
import { NextResponse } from "next/server";
import { ApiError, handleApiError, parseBody } from "@/lib/api";
import { rateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import { requireUserApi } from "@/lib/session";
import { getOwnedThread } from "@/lib/copilot/threads";
import { runCopilotTurn, type CopilotStreamEvent } from "@/lib/copilot/stream";

export const dynamic = "force-dynamic";

const Body = z.object({ content: z.string().trim().min(1, "Say something first.").max(4000, "Keep it under 4,000 characters.") });

/**
 * POST /api/copilot/threads/[id]/messages `{ content }` → Server-Sent Events of `CopilotStreamEvent`s
 * (`event: <type>` / `data: <json>`). The user's message and the assistant's reply (with its tool
 * trace and proposals) are persisted by `runCopilotTurn`; closing the connection stops generation
 * and stores what was produced so far. 30 messages per 10 minutes.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserApi(req);
    if (!user) throw new ApiError(401, "Sign in required", "unauthorized");
    const r = await rateLimit(`copilot.message:user:${user.id}`, 30, 600);
    if (!r.ok) return NextResponse.json({ error: { code: "rate_limited", message: "You've sent a lot of messages. Give it a few minutes." } }, { status: 429, headers: rateLimitHeaders(r) });
    const { id } = await ctx.params;
    const thread = await getOwnedThread(user.id, id);
    const { content } = await parseBody(req, Body);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: CopilotStreamEvent) => controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            clearInterval(keepAlive);
          }
        }, 15_000);
        try {
          for await (const ev of runCopilotTurn({ userId: user.id, threadId: thread.id, content, signal: req.signal })) {
            if (req.signal.aborted) break;
            send(ev);
          }
        } catch (err) {
          console.error("[copilot] stream failed", err);
          try {
            send({ type: "error", message: "The connection to the copilot dropped. Your message is saved — try again." });
          } catch {
            // the client is gone
          }
        } finally {
          clearInterval(keepAlive);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { createThread, listThreads, toThreadDTO } from "@/lib/copilot/threads";

export const dynamic = "force-dynamic";

/** GET /api/copilot/threads → { threads: ThreadDTO[] } (most recent first) */
export const GET = withUser(async (_req, { user }) => {
  const threads = await listThreads(user.id);
  return json({ threads });
});

const Body = z.object({ title: z.string().trim().max(80).optional() });

/** POST /api/copilot/threads `{ title? }` → { thread } */
export const POST = withUser(
  async (req, { user }) => {
    const body = req.headers.get("content-length") === "0" || !req.headers.get("content-type") ? {} : await parseBody(req, Body);
    const thread = await createThread(user.id, body.title);
    return json({ thread: toThreadDTO({ ...thread, _count: { messages: 0 }, messages: [] }) }, { status: 201 });
  },
  { rateLimit: { key: "copilot.thread", limit: 30, windowSeconds: 600 } },
);

import { json, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { deleteThread, getOwnedThread, getThreadMessages, toThreadDTO } from "@/lib/copilot/threads";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/copilot/threads/[id] → { thread, messages } */
export const GET = withUser<{ id: string }>(async (_req, { user, params }) => {
  const thread = await getOwnedThread(user.id, params.id);
  const [messages, count] = await Promise.all([getThreadMessages(thread.id), db.copilotMessage.count({ where: { threadId: thread.id } })]);
  return json({ thread: toThreadDTO({ ...thread, _count: { messages: count } }), messages });
});

/** DELETE /api/copilot/threads/[id] → { ok: true } */
export const DELETE = withUser<{ id: string }>(async (req, { user, params }) => {
  await deleteThread(user.id, params.id);
  await audit({ userId: user.id, action: "copilot.thread_deleted", entityType: "copilotThread", entityId: params.id, ...requestMeta(req) });
  return json({ ok: true });
});

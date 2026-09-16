import { z } from "zod";
import { APIError } from "better-auth/api";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeUserAgent, listUserSessions } from "@/lib/settings/sessions";

export const dynamic = "force-dynamic";

/** GET /api/settings/sessions → { sessions: SessionDTO[] } (current first) */
export const GET = withUser(async (req, { user }) => {
  const current = await auth.api.getSession({ headers: req.headers });
  const sessions = await listUserSessions(user.id, current?.session.token ?? null);
  return json({ sessions });
});

const Body = z.object({ id: z.string().min(1).max(128) });

/**
 * DELETE /api/settings/sessions `{ id }` → { ok: true, current: boolean } — revokes one of the
 * caller's sessions by row id. The token is looked up server-side so it is never exposed to script.
 */
export const DELETE = withUser(
  async (req, { user }) => {
    const { id } = await parseBody(req, Body);
    const target = await db.session.findFirst({ where: { id, userId: user.id }, select: { id: true, token: true, userAgent: true } });
    if (!target) throw new ApiError(404, "That session is already signed out.", "not_found");
    const current = await auth.api.getSession({ headers: req.headers });
    const isCurrent = current?.session.token === target.token;
    try {
      await auth.api.revokeSession({ body: { token: target.token }, headers: req.headers });
    } catch (err) {
      if (err instanceof APIError) throw new ApiError(400, err.message || "Could not revoke the session.", "revoke_failed");
      throw err;
    }
    await audit({ userId: user.id, action: "session.revoked", entityType: "session", entityId: target.id, meta: { current: isCurrent, device: describeUserAgent(target.userAgent) }, ...requestMeta(req) });
    return json({ ok: true, current: isCurrent });
  },
  { rateLimit: { key: "settings.sessions.revoke", limit: 30, windowSeconds: 600 } },
);

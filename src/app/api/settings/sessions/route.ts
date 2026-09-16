import { z } from "zod";
import { APIError } from "better-auth/api";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { listUserSessions } from "@/lib/settings/sessions";

export const dynamic = "force-dynamic";

/** GET /api/settings/sessions → { sessions: SessionDTO[] } (current first) */
export const GET = withUser(async (req, { user }) => {
  const current = await auth.api.getSession({ headers: req.headers });
  const sessions = await listUserSessions(user.id, current?.session.token ?? null);
  return json({ sessions });
});

const Body = z.object({ token: z.string().min(1) });

/** DELETE /api/settings/sessions `{ token }` → { ok: true, current: boolean } — revokes one session (the caller's own if it matches). */
export const DELETE = withUser(async (req, { user }) => {
  const { token } = await parseBody(req, Body);
  const current = await auth.api.getSession({ headers: req.headers });
  const own = await listUserSessions(user.id, current?.session.token ?? null);
  const target = own.find((s) => s.token === token);
  if (!target) throw new ApiError(404, "That session is already signed out.", "not_found");
  try {
    await auth.api.revokeSession({ body: { token }, headers: req.headers });
  } catch (err) {
    if (err instanceof APIError) throw new ApiError(400, err.message || "Could not revoke the session.", "revoke_failed");
    throw err;
  }
  await audit({ userId: user.id, action: "session.revoked", entityType: "session", entityId: target.id, meta: { current: target.current, device: target.device }, ...requestMeta(req) });
  return json({ ok: true, current: target.current });
});

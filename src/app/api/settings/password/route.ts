import { z } from "zod";
import { APIError } from "better-auth/api";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { auth } from "@/lib/auth";

const Body = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(10, "Use at least 10 characters").max(128),
  revokeOtherSessions: z.boolean().default(true),
});

/** POST /api/settings/password `{ currentPassword, newPassword, revokeOtherSessions? }` → { ok: true } */
export const POST = withUser(
  async (req, { user }) => {
    const body = await parseBody(req, Body);
    if (body.currentPassword === body.newPassword) throw new ApiError(400, "Choose a password you haven't used here before.", "same_password");
    try {
      await auth.api.changePassword({ body, headers: req.headers });
    } catch (err) {
      if (err instanceof APIError) {
        const status = typeof err.statusCode === "number" ? err.statusCode : 400;
        const message = status === 400 || status === 401 ? "That current password isn't right." : err.message || "Could not change the password.";
        await audit({ userId: user.id, action: "password.change_failed", meta: { status }, ...requestMeta(req) });
        throw new ApiError(status === 401 ? 400 : status, message, "password_change_failed");
      }
      throw err;
    }
    await audit({ userId: user.id, action: "password.changed", meta: { revokeOtherSessions: body.revokeOtherSessions }, ...requestMeta(req) });
    return json({ ok: true });
  },
  { rateLimit: { key: "settings.password", limit: 5, windowSeconds: 600 } },
);

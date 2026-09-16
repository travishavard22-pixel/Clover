import { z } from "zod";
import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { RegisterDeviceSchema, listDevices, registerDevice, removeDeviceById, unregisterDevice } from "@/lib/push";

export const dynamic = "force-dynamic";

/** GET /api/push/devices → { devices } — the phones and desktops registered for push on this account. */
export const GET = withUser(async (_req, { user }) => json({ devices: await listDevices(user.id) }));

/** POST /api/push/devices `{ token, platform, deviceName? }` → { device } — called by the native shells after the OS grants permission. */
export const POST = withUser(
  async (req, { user }) => {
    const input = await parseBody(req, RegisterDeviceSchema);
    const device = await registerDevice(user.id, input);
    await audit({ userId: user.id, action: "push.device_registered", entityType: "push_device", entityId: device.id, meta: { platform: device.platform }, ...requestMeta(req) });
    return json({ device });
  },
  { rateLimit: { key: "push.register", limit: 30, windowSeconds: 600 } },
);

const RemoveSchema = z.union([z.object({ token: z.string().min(16).max(4096) }), z.object({ id: z.string().min(1).max(64) })]);

/** DELETE /api/push/devices `{ token }` or `{ id }` → { ok } — on sign-out, or from the settings page. */
export const DELETE = withUser(
  async (req, { user }) => {
    const input = await parseBody(req, RemoveSchema);
    const removed = "token" in input ? await unregisterDevice(user.id, input.token) : await removeDeviceById(user.id, input.id);
    if (!removed) throw new ApiError(404, "That device is not registered.", "not_found");
    await audit({ userId: user.id, action: "push.device_removed", entityType: "push_device", entityId: "id" in input ? input.id : undefined, ...requestMeta(req) });
    return json({ ok: true });
  },
  { rateLimit: { key: "push.remove", limit: 30, windowSeconds: 600 } },
);

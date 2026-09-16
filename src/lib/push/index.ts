import { z } from "zod";
import { db } from "../db";
import { apnsProviderFromEnv } from "./apns";
import { fcmProviderFromEnv } from "./fcm";
import type { PushMessage, PushProvider } from "./types";

export const PushPlatformSchema = z.enum(["ios", "android", "web"]);
export type PushPlatform = z.infer<typeof PushPlatformSchema>;

export const RegisterDeviceSchema = z.object({
  token: z.string().min(16).max(4096),
  platform: PushPlatformSchema,
  deviceName: z.string().max(80).optional(),
});

export type PushDeviceDTO = { id: string; platform: PushPlatform; deviceName: string | null; lastSeenAt: string; createdAt: string };

/** Registers (or re-attaches) a device token to a user. A token only ever belongs to one account. */
export async function registerDevice(userId: string, input: z.infer<typeof RegisterDeviceSchema>) {
  const row = await db.pushDevice.upsert({
    where: { token: input.token },
    create: { userId, token: input.token, platform: input.platform, deviceName: input.deviceName ?? null },
    update: { userId, platform: input.platform, deviceName: input.deviceName ?? undefined, lastSeenAt: new Date() },
  });
  return toDTO(row);
}

export async function unregisterDevice(userId: string, token: string) {
  const r = await db.pushDevice.deleteMany({ where: { userId, token } });
  return r.count > 0;
}

export async function removeDeviceById(userId: string, id: string) {
  const r = await db.pushDevice.deleteMany({ where: { userId, id } });
  return r.count > 0;
}

export async function listDevices(userId: string): Promise<PushDeviceDTO[]> {
  const rows = await db.pushDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" } });
  return rows.map(toDTO);
}

function toDTO(row: { id: string; platform: string; deviceName: string | null; lastSeenAt: Date; createdAt: Date }): PushDeviceDTO {
  return { id: row.id, platform: PushPlatformSchema.catch("web").parse(row.platform), deviceName: row.deviceName, lastSeenAt: row.lastSeenAt.toISOString(), createdAt: row.createdAt.toISOString() };
}

/** iOS tokens go to APNs directly; everything else goes through FCM. Either provider may be unconfigured. */
export function providerFor(platform: string, providers: { apns: PushProvider | null; fcm: PushProvider | null } = { apns: apnsProviderFromEnv(), fcm: fcmProviderFromEnv() }): PushProvider | null {
  if (platform === "ios") return providers.apns ?? providers.fcm;
  return providers.fcm;
}

/**
 * Sends a notification to every device the user registered. Devices the provider reports as gone
 * are removed. Never throws: a push failure must not fail the job that produced the notification.
 */
export async function sendPushToUser(userId: string, message: PushMessage): Promise<{ sent: number; failed: number; removed: number }> {
  const result = { sent: 0, failed: 0, removed: 0 };
  let devices: Array<{ id: string; token: string; platform: string }>;
  try {
    devices = await db.pushDevice.findMany({ where: { userId }, select: { id: true, token: true, platform: true } });
  } catch {
    return result;
  }
  if (!devices.length) return result;
  const providers = { apns: apnsProviderFromEnv(), fcm: fcmProviderFromEnv() };
  await Promise.all(
    devices.map(async (d) => {
      const provider = providerFor(d.platform, providers);
      if (!provider) return;
      const outcome = await provider.send(d.token, message);
      if (outcome.ok) {
        result.sent++;
        return;
      }
      result.failed++;
      if (outcome.invalidToken) {
        await db.pushDevice.delete({ where: { id: d.id } }).catch(() => undefined);
        result.removed++;
      } else {
        console.warn(`[push] ${provider.name} delivery failed for device ${d.id}: ${outcome.error}`);
      }
    }),
  );
  return result;
}

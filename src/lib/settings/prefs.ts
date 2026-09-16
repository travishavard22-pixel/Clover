import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api";
import { changedKeys, toPreferencesDTO, type PreferencesDTO, type PreferencesPatch, type ProfilePatch } from "./schema";

export type ProfileDTO = { id: string; name: string; email: string; emailVerified: boolean; image: string | null; createdAt: string };

/** Preferences are created by the sign-up hook; this covers accounts that predate it. */
export async function getPreferences(userId: string): Promise<PreferencesDTO> {
  const row = (await db.userPreferences.findUnique({ where: { userId } })) ?? (await db.userPreferences.create({ data: { userId } }));
  return toPreferencesDTO(row);
}

export async function getProfile(userId: string): Promise<ProfileDTO> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, emailVerified: true, image: true, createdAt: true } });
  if (!u) throw new ApiError(404, "Account not found", "not_found");
  return { ...u, createdAt: u.createdAt.toISOString() };
}

export async function updatePreferences(userId: string, patch: PreferencesPatch, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<PreferencesDTO> {
  const keys = changedKeys(patch);
  if (keys.length === 0) return getPreferences(userId);
  const current = await db.userPreferences.findUnique({ where: { userId }, select: { offersLocalPickup: true, offersShipping: true } });
  const pickup = patch.offersLocalPickup ?? current?.offersLocalPickup ?? true;
  const shipping = patch.offersShipping ?? current?.offersShipping ?? true;
  if (!pickup && !shipping) throw new ApiError(400, "Keep at least one of shipping or local pickup on, or buyers have no way to receive the item.", "validation");
  const row = await db.userPreferences.upsert({ where: { userId }, create: { userId, ...patch }, update: patch });
  await audit({ userId, action: "preferences.updated", entityType: "userPreferences", entityId: userId, meta: { keys }, ...meta });
  return toPreferencesDTO(row);
}

export async function updateProfile(userId: string, patch: ProfilePatch, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<ProfileDTO> {
  const u = await db.user.update({ where: { id: userId }, data: { name: patch.name }, select: { id: true, name: true, email: true, emailVerified: true, image: true, createdAt: true } });
  await audit({ userId, action: "profile.updated", entityType: "user", entityId: userId, meta: { keys: ["name"] }, ...meta });
  return { ...u, createdAt: u.createdAt.toISOString() };
}

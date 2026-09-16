import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { publicCapabilities } from "@/lib/env";
import { getPreferences, getProfile, SettingsPutSchema, updatePreferences, updateProfile } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/settings → { profile, preferences, capabilities } */
export const GET = withUser(async (_req, { user }) => {
  const [profile, preferences] = await Promise.all([getProfile(user.id), getPreferences(user.id)]);
  return json({ profile, preferences, capabilities: publicCapabilities() });
});

/** PUT /api/settings `{ preferences?: Partial<PreferencesDTO>, profile?: { name } }` → { profile, preferences } */
export const PUT = withUser(async (req, { user }) => {
  const body = await parseBody(req, SettingsPutSchema);
  const meta = requestMeta(req);
  const [profile, preferences] = await Promise.all([
    body.profile ? updateProfile(user.id, body.profile, meta) : getProfile(user.id),
    body.preferences ? updatePreferences(user.id, body.preferences, meta) : getPreferences(user.id),
  ]);
  return json({ profile, preferences });
});

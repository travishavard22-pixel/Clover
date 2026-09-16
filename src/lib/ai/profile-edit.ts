import { z } from "zod";
import { ItemProfileSchema, type EvidencedField, type ItemProfile } from "./schemas";

/**
 * Seller edits to an `ItemProfile`. Pure functions: the route handler persists the result.
 *
 * Every edit marks the field as verified by the seller (`userVerified`), sets its tier to CONFIDENT and
 * writes a plain note, so the UI and the listing generator treat it as ground truth. The list of
 * verified field keys lives at the top level of `ItemProfile.data` so it survives a re-analysis
 * (`mergeUserVerified` re-applies those fields onto a freshly generated profile).
 */

export const PROFILE_FIELD_KEYS = ["itemName", "brand", "model", "modelNumber", "color", "material", "size", "dimensions", "approximateAge"] as const;
export type ProfileFieldKey = (typeof PROFILE_FIELD_KEYS)[number];

/** Field keys accepted by PATCH: a named profile field, `categoryPath`, or `attribute:<name>`. */
export type EditableKey = ProfileFieldKey | "categoryPath" | `attribute:${string}`;

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  itemName: "Item",
  brand: "Brand",
  model: "Model",
  modelNumber: "Model number",
  color: "Color",
  material: "Material",
  size: "Size",
  dimensions: "Dimensions",
  approximateAge: "Age",
};

/** What the profile PATCH route persists: the profile plus its verified-field bookkeeping. */
export const StoredProfileSchema = ItemProfileSchema.extend({
  userVerified: z.array(z.string()).catch([]).default([]),
});
export type StoredProfile = z.infer<typeof StoredProfileSchema>;

export function parseStoredProfile(data: unknown): StoredProfile | null {
  const r = StoredProfileSchema.safeParse(data);
  return r.success ? r.data : null;
}

export const USER_NOTE = "Confirmed by you";

export function isAttributeKey(key: string): key is `attribute:${string}` {
  return key.startsWith("attribute:") && key.length > "attribute:".length;
}

export function attributeName(key: `attribute:${string}`): string {
  return key.slice("attribute:".length);
}

export function isProfileFieldKey(key: string): key is ProfileFieldKey {
  return (PROFILE_FIELD_KEYS as readonly string[]).includes(key);
}

function verifiedField(value: string, previous: EvidencedField | null): EvidencedField {
  return { value, confidence: 1, tier: "CONFIDENT", evidenceImage: previous?.evidenceImage ?? null, note: USER_NOTE };
}

function addVerified(list: string[], key: string): string[] {
  return list.includes(key) ? list : [...list, key];
}

function removeVerified(list: string[], key: string): string[] {
  return list.filter((k) => k !== key);
}

/** Which Item columns mirror a profile key (so re-analysis respects the seller's edit). */
export type ItemMirror = { title?: string; brand?: string | null; model?: string | null; categoryPath?: string[]; specifics?: Record<string, string | null>; userEdited: string[] };

export type EditResult = { profile: StoredProfile; mirror: ItemMirror; identityChanged: boolean };

const IDENTITY_KEYS: ReadonlySet<string> = new Set(["itemName", "brand", "model", "modelNumber"]);

/** Splits "A > B > C" (or "A / B / C") into a category path. */
export function parseCategoryPath(value: string): string[] {
  return value
    .split(/\s*(?:>|\/|›)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Sets one field. An empty value clears a nullable field (and un-verifies it); `itemName` cannot be
 * cleared. Attributes are created when they do not exist yet, which is how an "unknown" becomes a fact.
 */
export function applyFieldEdit(current: StoredProfile, key: EditableKey, rawValue: string): EditResult {
  const value = rawValue.trim();
  const profile: StoredProfile = structuredClone(current);
  const mirror: ItemMirror = { userEdited: [] };
  let identityChanged = false;

  if (key === "categoryPath") {
    const path = parseCategoryPath(value);
    if (path.length === 0) throw new Error("Enter at least one category");
    profile.categoryPath = path;
    profile.categoryConfidence = 1;
    profile.userVerified = addVerified(profile.userVerified, "categoryPath");
    mirror.categoryPath = path;
    mirror.userEdited.push("categoryPath");
    return { profile, mirror, identityChanged };
  }

  if (isAttributeKey(key)) {
    const name = attributeName(key).trim();
    if (!name) throw new Error("Attribute name is required");
    const idx = profile.attributes.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
    if (value === "") {
      if (idx >= 0) profile.attributes.splice(idx, 1);
      profile.userVerified = removeVerified(profile.userVerified, key);
      mirror.specifics = { [name]: null };
    } else {
      const field = verifiedField(value, idx >= 0 ? profile.attributes[idx]!.field : null);
      if (idx >= 0) profile.attributes[idx] = { name: profile.attributes[idx]!.name, field };
      else profile.attributes.push({ name, field });
      profile.userVerified = addVerified(profile.userVerified, `attribute:${idx >= 0 ? profile.attributes[idx]!.name : name}`);
      mirror.specifics = { [idx >= 0 ? profile.attributes[idx]!.name : name]: value };
      // A fact the seller supplied is no longer unknown.
      profile.unknowns = profile.unknowns.filter((u) => !sameFact(u, name));
    }
    return { profile, mirror, identityChanged };
  }

  if (!isProfileFieldKey(key)) throw new Error(`Unknown field "${String(key)}"`);

  if (key === "itemName") {
    if (value === "") throw new Error("The item name cannot be empty");
    profile.itemName = verifiedField(value, profile.itemName);
    profile.userVerified = addVerified(profile.userVerified, key);
    mirror.title = value.slice(0, 140);
    mirror.userEdited.push("title");
    identityChanged = true;
  } else if (value === "") {
    profile[key] = null;
    profile.userVerified = removeVerified(profile.userVerified, key);
    if (key === "brand" || key === "model") {
      mirror[key] = null;
      mirror.userEdited.push(key);
      identityChanged = true;
    } else mirror.specifics = { [PROFILE_FIELD_LABELS[key]]: null };
  } else {
    profile[key] = verifiedField(value, profile[key]);
    profile.userVerified = addVerified(profile.userVerified, key);
    if (key === "brand" || key === "model") {
      mirror[key] = value;
      mirror.userEdited.push(key);
    } else mirror.specifics = { [PROFILE_FIELD_LABELS[key]]: value };
    if (IDENTITY_KEYS.has(key)) identityChanged = true;
    profile.unknowns = profile.unknowns.filter((u) => !sameFact(u, PROFILE_FIELD_LABELS[key]));
  }

  if (identityChanged) confirmIdentity(profile);
  return { profile, mirror, identityChanged };
}

/** Adopts one of the AI's alternative identifications as the confirmed identity. */
export function applyAlternative(current: StoredProfile, index: number): EditResult {
  const alt = current.alternativeIdentifications[index];
  if (!alt) throw new Error("That alternative no longer exists");
  const profile: StoredProfile = structuredClone(current);
  const previous = { itemName: profile.itemName.value, brand: profile.brand?.value ?? null, model: profile.model?.value ?? null, likelihood: profile.identityConfidence };

  profile.itemName = verifiedField(alt.itemName, profile.itemName);
  profile.brand = alt.brand ? verifiedField(alt.brand, profile.brand) : null;
  profile.model = alt.model ? verifiedField(alt.model, profile.model) : null;
  profile.userVerified = ["itemName", "brand", "model"].reduce(addVerified, profile.userVerified);
  // Keep the rejected identification available so the seller can switch back.
  profile.alternativeIdentifications = [previous, ...profile.alternativeIdentifications.filter((_, i) => i !== index)];
  confirmIdentity(profile);

  const mirror: ItemMirror = { title: alt.itemName.slice(0, 140), brand: alt.brand, model: alt.model, userEdited: ["title", "brand", "model"] };
  return { profile, mirror, identityChanged: true };
}

function confirmIdentity(profile: StoredProfile) {
  profile.identityConfidence = 1;
  profile.identityTier = "CONFIDENT";
}

/** Loose match between an "unknown" sentence and a field label, e.g. "Exact size" ~ "Size". */
function sameFact(unknown: string, label: string): boolean {
  const u = unknown.toLowerCase();
  const l = label.toLowerCase();
  return u === l || u.split(/\W+/).includes(l);
}

/**
 * Re-applies the seller's verified fields from the previous profile onto a newly generated one so a
 * re-analysis never silently undoes a correction.
 */
export function mergeUserVerified(previous: StoredProfile | null, next: ItemProfile): StoredProfile {
  const merged: StoredProfile = { ...structuredClone(next), userVerified: [] };
  if (!previous || previous.userVerified.length === 0) return merged;
  let identity = false;
  for (const key of previous.userVerified) {
    if (key === "categoryPath") {
      merged.categoryPath = previous.categoryPath;
      merged.categoryConfidence = 1;
    } else if (isAttributeKey(key)) {
      const name = attributeName(key);
      const prev = previous.attributes.find((a) => a.name === name);
      if (!prev) continue;
      const idx = merged.attributes.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
      if (idx >= 0) merged.attributes[idx] = prev;
      else merged.attributes.push(prev);
    } else if (isProfileFieldKey(key)) {
      if (key === "itemName") merged.itemName = previous.itemName;
      else merged[key] = previous[key];
      if (IDENTITY_KEYS.has(key)) identity = true;
    } else continue;
    merged.userVerified = addVerified(merged.userVerified, key);
  }
  if (identity) confirmIdentity(merged);
  return merged;
}

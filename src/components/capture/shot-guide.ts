/**
 * The guided shot sequence. It is a hint, never a gate: sellers can shoot in any order, skip
 * steps, or take more than four. Labels are saved on each photo so the analysis knows which
 * angle it is looking at.
 */
export const SHOT_GUIDE = [
  { label: "Front", hint: "Fill the frame with the whole item" },
  { label: "Back", hint: "Turn it around — buyers check the back" },
  { label: "Label or tag", hint: "Brand, model or size tag, close and sharp" },
  { label: "Any defects", hint: "Scratches, wear, missing parts — be honest" },
] as const;

export type ShotGuideStep = (typeof SHOT_GUIDE)[number];

/** Guide step for the next shot given how many were taken (null once the sequence is done). */
export function guideFor(shotCount: number): ShotGuideStep | null {
  return SHOT_GUIDE[shotCount] ?? null;
}

/** Label recorded on a captured shot. Past the sequence we number the extra angles. */
export function labelForShot(index: number): string {
  return SHOT_GUIDE[index]?.label ?? `Angle ${index + 1}`;
}

export const MAX_SHOTS = 24;

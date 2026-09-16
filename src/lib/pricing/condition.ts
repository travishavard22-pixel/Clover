import type { ItemProfile } from "../ai/schemas";
import type { ConditionGrade } from "../db";
import { CONDITION_LABELS } from "../marketplaces/registry";

export type DefectCounts = { minor: number; moderate: number; major: number; total: number };

export function defectCounts(defects: ItemProfile["condition"]["defects"]): DefectCounts {
  const out: DefectCounts = { minor: 0, moderate: 0, major: 0, total: defects.length };
  for (const d of defects) out[d.severity]++;
  return out;
}

/** "Very good" → lower-case first letter for mid-sentence use, except the all-lower "for parts". */
export function gradeLabel(grade: ConditionGrade, opts: { lower?: boolean } = {}): string {
  const label = CONDITION_LABELS[grade].generic;
  if (!opts.lower) return label;
  return grade === "FOR_PARTS" ? "for parts" : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Status line for the `condition` step, e.g. "Graded as Very good with 2 minor defects". */
export function describeGrading(grade: ConditionGrade, defects: ItemProfile["condition"]["defects"]): string {
  const c = defectCounts(defects);
  if (c.total === 0) return `Graded as ${gradeLabel(grade)} with no visible defects`;
  const parts: string[] = [];
  if (c.major) parts.push(`${c.major} major`);
  if (c.moderate) parts.push(`${c.moderate} moderate`);
  if (c.minor) parts.push(`${c.minor} minor`);
  const noun = c.total === 1 ? "defect" : "defects";
  return `Graded as ${gradeLabel(grade)} with ${parts.join(", ")} ${noun}`;
}

/** Buyer-facing condition notes: the grade summary followed by every defect with location and photo reference. */
export function conditionNotesFrom(condition: ItemProfile["condition"]): string {
  const lines = [condition.summary.trim()];
  for (const d of condition.defects) {
    const where = d.location ? ` — ${d.location}` : "";
    const photo = d.evidenceImage ? ` (photo ${d.evidenceImage})` : "";
    lines.push(`${capitalize(d.severity)} ${d.type.replace("_", " ")}${where}: ${d.description}${photo}`);
  }
  if (condition.functionalStatus === "untested") lines.push("Function not tested.");
  if (condition.functionalStatus === "not_working") lines.push("Not working.");
  if (condition.functionalStatus === "powers_on") lines.push("Powers on; not fully tested.");
  if (condition.functionalStatus === "tested_working") lines.push("Tested and working.");
  return lines.join("\n");
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

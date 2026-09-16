import type { ConditionGrade } from "@/lib/db";
import { CONDITION_LABELS } from "@/lib/marketplaces/registry";

export function daysLabel(days: number | null): string {
  if (days === null) return "Not listed";
  if (days === 0) return "Listed today";
  if (days === 1) return "1 day listed";
  return `${days} days listed`;
}

export function shortDays(days: number | null): string {
  if (days === null) return "—";
  return `${days}d`;
}

export function conditionLabel(grade: ConditionGrade | null): string {
  return grade ? CONDITION_LABELS[grade].generic : "Not graded";
}

export const CONDITION_OPTIONS: Array<{ value: ConditionGrade; label: string }> = (Object.keys(CONDITION_LABELS) as ConditionGrade[]).map((g) => ({ value: g, label: CONDITION_LABELS[g].generic }));

export function relativeTime(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function toDateInput(d: Date | null): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateInput(v: string): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

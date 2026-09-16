"use client";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { ConditionGrade } from "@/lib/db";
import type { ItemSummary } from "@/lib/items/summary";
import { CONDITION_LABELS } from "@/lib/marketplaces/registry";
import { functionalLine } from "@/lib/listings/compose";
import { cn } from "@/lib/utils/cn";
import { errorMessage } from "./item-api";

const SEVERITY: Record<"minor" | "moderate" | "major", { dot: string; label: string }> = {
  minor: { dot: "bg-info", label: "Minor" },
  moderate: { dot: "bg-warning", label: "Moderate" },
  major: { dot: "bg-danger", label: "Major" },
};

const GRADES = Object.keys(CONDITION_LABELS) as ConditionGrade[];

/** Grade, tier, the two honest sentences, each defect with severity and photo link, and function. */
export function ConditionCard({ summary, onGrade, onEvidence }: { summary: ItemSummary; onGrade: (grade: ConditionGrade) => Promise<void>; onEvidence: (photoIndex: number, caption: string) => void }) {
  const profile = summary.profile;
  const [busy, setBusy] = useState(false);
  const photoCount = summary.photos.filter((p) => p.sortOrder < 1000).length;
  const grade = summary.item.conditionGrade ?? profile?.data.condition.grade ?? null;

  const change = async (g: string) => {
    setBusy(true);
    try {
      await onGrade(g as ConditionGrade);
    } catch (err) {
      toast.error("Couldn't change the grade", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return (
      <Card>
        <CardHeader title="Condition" description="Graded during analysis." />
      </Card>
    );
  }
  const c = profile.data.condition;
  const gradeChanged = summary.item.conditionGrade && summary.item.conditionGrade !== c.grade;
  const fn = functionalLine(c.functionalStatus);

  return (
    <Card>
      <CardHeader title="Condition" description={c.summary} action={<ConfidenceBadge tier={c.tier} score={c.confidence} expert={summary.prefs.expertMode} />} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="condition-grade" className="text-xs uppercase tracking-wide text-muted">
              Grade
            </label>
            <Select id="condition-grade" value={grade ?? undefined} onValueChange={(v) => void change(v)} disabled={busy} options={GRADES.map((g) => ({ value: g, label: CONDITION_LABELS[g].generic }))} className="mt-1" />
          </div>
          <p className="max-w-xs text-xs text-secondary">{gradeChanged ? `Clover graded it ${CONDITION_LABELS[c.grade].generic.toLowerCase()}; you set ${CONDITION_LABELS[summary.item.conditionGrade!].generic.toLowerCase()}. The price uses your grade.` : "Changing the grade re-prices the item."}</p>
        </div>

        <div>
          <h4 className="text-xs uppercase tracking-wide text-muted">Defects{c.defects.length ? ` (${c.defects.length})` : ""}</h4>
          {c.defects.length === 0 ? (
            <p className="mt-1.5 text-sm text-secondary">No defects were found in the photos. Wear that is not photographed cannot be graded.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-border-subtle">
              {c.defects.map((d, i) => {
                const sev = SEVERITY[d.severity];
                const hasPhoto = d.evidenceImage !== null && d.evidenceImage >= 1 && d.evidenceImage <= photoCount;
                return (
                  <li key={i} className="flex items-start gap-3 py-2.5">
                    <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", sev.dot)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-primary">
                        <span className="font-medium capitalize">{d.type.replace("_", " ")}</span>
                        <span className="text-secondary"> · {d.location}</span>
                      </div>
                      <p className="text-sm text-secondary">{d.description}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>{sev.label}</span>
                        {hasPhoto && (
                          <button type="button" onClick={() => onEvidence(d.evidenceImage! - 1, `${sev.label} ${d.type.replace("_", " ")} — ${d.location}: ${d.description}`)} className="inline-flex items-center gap-1 rounded-full border border-border-subtle px-2 py-0.5 text-secondary hover:bg-surface-sunken" aria-label={`Show this defect in photo ${d.evidenceImage}`}>
                            <ImageIcon className="size-3" aria-hidden />
                            Photo {d.evidenceImage}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-sm bg-surface-sunken/60 px-3 py-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted">Function</span>
          <p className="text-primary">{fn ?? "Not applicable to this kind of item."}</p>
        </div>
      </CardBody>
    </Card>
  );
}

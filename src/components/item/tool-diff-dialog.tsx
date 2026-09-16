"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/select";
import { diffLines, diffWords, summarizeDiff, type DiffOp } from "@/lib/listings/diff";
import { listingTool } from "@/lib/listings/tool-catalog";
import type { ToolProposal } from "@/lib/listings/tools";
import { cn } from "@/lib/utils/cn";
import { errorMessage } from "./item-api";
import { SelfCheckBadge } from "./self-check-badge";

type View = "inline" | "side";

/** Review a tool's proposal as a diff before it touches the draft. "Keep current" is always one tap away. */
export function ToolDiffDialog({ proposal, onApply, onClose }: { proposal: ToolProposal | null; onApply: (p: ToolProposal) => Promise<void>; onClose: () => void }) {
  const [view, setView] = useState<View>("inline");
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => {
    if (!proposal) return [];
    const { current, proposal: next } = proposal;
    return [
      { key: "title", label: "Title", ops: diffWords(current.title, next.title), before: current.title, after: next.title },
      { key: "description", label: "Description", ops: diffWords(current.description, next.description), before: current.description, after: next.description },
      { key: "bullets", label: "Highlights", ops: diffLines(current.bullets, next.bullets), before: current.bullets.join("\n"), after: next.bullets.join("\n") },
      { key: "conditionText", label: "Condition", ops: diffWords(current.conditionText, next.conditionText), before: current.conditionText, after: next.conditionText },
      { key: "keywords", label: "Keywords", ops: diffLines(current.keywords, next.keywords), before: current.keywords.join(", "), after: next.keywords.join(", ") },
    ].filter((s) => summarizeDiff(s.ops).changed);
  }, [proposal]);

  const apply = async () => {
    if (!proposal) return;
    setBusy(true);
    try {
      await onApply(proposal);
      onClose();
    } catch (err) {
      toast.error("Couldn't apply the change", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const tool = proposal ? listingTool(proposal.tool) : null;
  return (
    <Dialog open={!!proposal} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={tool ? tool.label : "Review change"} description={tool ? `${tool.description} Nothing is saved until you apply it.` : undefined} size="xl">
        {proposal && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SelfCheckBadge selfCheck={proposal.selfCheck} />
              <Segmented aria-label="Diff layout" size="sm" value={view} onChange={setView} options={[{ value: "inline", label: "Inline" }, { value: "side", label: "Side by side" }]} />
            </div>
            {sections.length === 0 ? (
              <p className="text-sm text-secondary">The tool returned the same copy. Nothing to apply.</p>
            ) : (
              sections.map((s) => (
                <section key={s.key} aria-label={`${s.label} changes`} className="space-y-1.5">
                  <h4 className="text-xs uppercase tracking-wide text-muted">{s.label}</h4>
                  {view === "inline" ? (
                    <p className="whitespace-pre-wrap rounded-sm border border-border-subtle bg-surface-sunken/50 p-3 text-sm leading-relaxed text-primary">
                      <InlineDiff ops={s.ops} />
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-sm border border-border-subtle p-3 text-sm leading-relaxed">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Current</div>
                        <p className="whitespace-pre-wrap text-primary">
                          <InlineDiff ops={s.ops} only="delete" />
                        </p>
                      </div>
                      <div className="rounded-sm border border-accent/40 bg-accent-soft/30 p-3 text-sm leading-relaxed">
                        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Proposed</div>
                        <p className="whitespace-pre-wrap text-primary">
                          <InlineDiff ops={s.ops} only="insert" />
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              ))
            )}
            <p className="text-xs text-muted">
              Written by {proposal.provider === "demo" ? "the demo writer" : proposal.provider} ({proposal.model}). <span className="text-danger line-through decoration-danger/60">Removed</span> · <span className="rounded-[3px] bg-success-soft text-success">Added</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-3">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Keep current
              </Button>
              <Button onClick={() => void apply()} loading={busy} disabled={sections.length === 0}>
                Apply
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InlineDiff({ ops, only }: { ops: DiffOp[]; only?: "insert" | "delete" }) {
  return (
    <>
      {ops.map((op, i) => {
        if (op.kind === "equal") return <span key={i}>{op.text}</span>;
        if (only && op.kind !== only) return null;
        const added = op.kind === "insert";
        return (
          <span key={i} className={cn("rounded-[3px] px-0.5", added ? "bg-success-soft text-success" : "bg-danger-soft text-danger line-through decoration-danger/60")}>
            <span className="sr-only">{added ? "added: " : "removed: "}</span>
            {op.text}
          </span>
        );
      })}
    </>
  );
}

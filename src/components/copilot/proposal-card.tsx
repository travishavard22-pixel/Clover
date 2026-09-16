"use client";
import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import type { CopilotApplyResult, CopilotProposal } from "@/lib/copilot/proposals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { errorMessage } from "@/lib/client/request";
import { copilotApi } from "./copilot-api";

export type ProposalState = { status: "pending" | "applied" | "cancelled" | "failed"; result?: CopilotApplyResult; error?: string };

/** An action the copilot proposed. Nothing happens until the seller confirms; the outcome is shown in place. */
export function ProposalCard({ proposal, threadId, state, onState, readOnly }: { proposal: CopilotProposal; threadId: string | null; state: ProposalState; onState: (s: ProposalState) => void; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      const { result } = await copilotApi.applyProposal(threadId, proposal);
      onState({ status: "applied", result });
      toast.success(result.summary);
    } catch (err) {
      const message = errorMessage(err, "Could not apply the change.");
      onState({ status: "failed", error: message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const title = proposal.kind === "price_change" ? "Price change" : "Listing rewrite";

  return (
    <div className="mt-3 rounded-sm border border-border-default bg-surface-raised p-4" role="group" aria-label={`Proposed ${title.toLowerCase()} for ${proposal.itemTitle}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="accent">Proposal</Badge>
          <span className="text-sm font-semibold text-primary">{title}</span>
        </div>
        <span className="truncate text-sm text-secondary">{proposal.itemTitle}</span>
      </div>

      {proposal.kind === "price_change" ? (
        <div className="mt-3">
          <div className="flex items-center gap-3 text-lg">
            <Money cents={proposal.fromCents} className="tabular text-secondary line-through" />
            <ArrowRight className="size-4 text-muted" aria-hidden />
            <Money cents={proposal.toCents} className="display tabular text-2xl text-primary" />
          </div>
          <p className="mt-2 text-sm text-secondary">{proposal.reason}</p>
          {proposal.warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-warning">
              {proposal.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-secondary">{proposal.instruction}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xs bg-surface-sunken p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">Current</div>
              <div className="mt-1 font-medium text-primary">{proposal.from.title}</div>
              <p className="mt-1 line-clamp-4 text-secondary">{proposal.from.description}</p>
            </div>
            <div className="rounded-xs border border-accent/40 bg-accent-soft/40 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-accent-text">Proposed</div>
              <div className="mt-1 font-medium text-primary">{proposal.to.title}</div>
              <p className="mt-1 line-clamp-4 text-secondary">{proposal.to.description}</p>
            </div>
          </div>
          {proposal.selfCheck && (
            <p className="text-xs text-muted">
              Fact check: {proposal.selfCheck.verdict === "pass" ? "every claim is supported by the item record." : `${proposal.selfCheck.unsupportedCount} claim${proposal.selfCheck.unsupportedCount === 1 ? "" : "s"} could not be verified — review before publishing.`}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {state.status === "pending" && !readOnly && (
          <>
            <Button size="sm" leadingIcon={<Check className="size-4" aria-hidden />} loading={busy} onClick={confirm}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" leadingIcon={<X className="size-4" aria-hidden />} disabled={busy} onClick={() => onState({ status: "cancelled" })}>
              Cancel
            </Button>
            <span className="text-xs text-muted">Nothing changes until you confirm.</span>
          </>
        )}
        {state.status === "pending" && readOnly && <span className="text-xs text-muted">Proposed earlier — ask again for a fresh proposal.</span>}
        {state.status === "applied" && (
          <p className="flex items-start gap-2 text-sm text-success" role="status">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{state.result?.summary ?? "Applied."}</span>
          </p>
        )}
        {state.status === "cancelled" && <span className="text-sm text-muted">Cancelled — nothing changed.</span>}
        {state.status === "failed" && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
            <Button size="sm" variant="outline" onClick={confirm} loading={busy}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

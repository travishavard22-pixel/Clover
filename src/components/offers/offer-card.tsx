"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, ExternalLink, ImageOff, MessageSquare } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/ui/money";
import { relativeTime, signedPct, timeUntil } from "@/components/marketplaces/format";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import type { OfferDTO, OfferSuggestion } from "@/lib/offers";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import { cn } from "@/lib/utils/cn";
import { offersApi, type RespondResponse } from "./offers-api";
import { AcceptDialog, CounterDialog, DeclineDialog } from "./respond-dialogs";
import { SuggestionPanel } from "./suggestion-panel";

export type OfferCardProps = { offer: OfferDTO; onChanged: (offer: OfferDTO, response?: RespondResponse) => void; focused: boolean; index: number };

const STATUS: Record<OfferDTO["status"], { label: string; tone: "warning" | "success" | "neutral" | "info" | "danger" }> = {
  PENDING: { label: "Waiting for you", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  DECLINED: { label: "Declined", tone: "neutral" },
  COUNTERED: { label: "Countered", tone: "info" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

/**
 * One offer: who, where, on what, and the numbers that matter — offer against asking, the gap in
 * dollars and percent, and the estimated profit after fees and what you paid. Expanding asks for a
 * suggestion. Assisted channels get a guided panel: reply on the marketplace, record here.
 */
export function OfferCard({ offer, onChanged, focused, index }: OfferCardProps) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(focused);
  const [suggestion, setSuggestion] = useState<OfferSuggestion | null>(offer.suggestion);
  const [advising, setAdvising] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"accept" | "decline" | "counter" | null>(null);
  const [preset, setPreset] = useState<{ cents: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const open = offer.status === "PENDING";
  const m = offer.math;
  const below = m.differenceCents < 0;

  const advise = async () => {
    setAdvising(true);
    setAdviceError(null);
    try {
      const res = await offersApi.advise(offer.id);
      setSuggestion(res.suggestion);
    } catch (err) {
      setAdviceError(err instanceof Error ? err.message : "Couldn't get a suggestion.");
    } finally {
      setAdvising(false);
    }
  };

  useEffect(() => {
    if (expanded && open && !suggestion && !advising && !adviceError) void advise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const respond = async (action: "accept" | "decline" | "counter", counterCents?: number, message?: string) => {
    setBusy(true);
    try {
      const res = await offersApi.respond(offer.id, { action, counterCents, message });
      onChanged(res.offer, res);
      setDialog(null);
      const via = res.repliedVia === "api" ? `Sent to ${offer.marketplaceName}` : "Recorded";
      if (action === "accept") {
        const manual = res.guarded.filter((g) => g.outcome === "user_action").map((g) => MARKETPLACES[g.marketplace].name);
        const auto = res.guarded.filter((g) => g.outcome === "ended" || g.outcome === "queued_end").map((g) => MARKETPLACES[g.marketplace].name);
        toast.success(`Sold — ${offer.item.title}`, { description: [auto.length ? `Ending on ${auto.join(", ")}.` : null, manual.length ? `End the ${manual.join(" and ")} listing${manual.length > 1 ? "s" : ""} yourself — it's under Listings.` : null].filter(Boolean).join(" ") || `${via}.` });
      } else if (action === "counter") toast.success(`${via}: counter at ${((counterCents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`);
      else toast.success(`${via}: declined`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't go through. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.li
      id={`offer-${offer.id}`}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1], delay: reduce ? 0 : Math.min(index, 6) * 0.04 }}
      className={cn("surface-card p-4 sm:p-5", open && "border-warning/50", focused && "ring-2 ring-accent")}
      aria-labelledby={`offer-${offer.id}-title`}
    >
      <div className="flex gap-3 sm:gap-4">
        <Link href={`/items/${offer.item.id}`} className="size-16 shrink-0 overflow-hidden rounded-xs bg-surface-sunken outline-none focus-visible:ring-2 focus-visible:ring-accent sm:size-20" aria-label={`Open ${offer.item.title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin URL */}
          {offer.item.cover ? <img src={offer.item.cover.thumbUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-muted"><ImageOff className="size-5" strokeWidth={1.5} aria-hidden /></span>}
        </Link>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id={`offer-${offer.id}-title`} className="truncate text-sm font-medium text-primary">
                {offer.item.title}
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <MonogramTile shortName={offer.marketplaceShortName} name={offer.marketplaceName} color={offer.marketplaceColor} size="sm" />
                  {offer.marketplaceShortName}
                </span>
                <span>·</span>
                <span>{offer.buyerName}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1" title={new Date(offer.receivedAt).toLocaleString()}>
                  <Clock className="size-3" aria-hidden /> {relativeTime(offer.receivedAt)}
                </span>
                {offer.expiresAt && open && <span className="text-warning">expires {timeUntil(offer.expiresAt)}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {offer.isDemo && <DemoBadge />}
              <Badge tone={STATUS[offer.status].tone}>{STATUS[offer.status].label}</Badge>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Offer</dt>
              <dd className="text-xl font-semibold tabular text-primary">
                <Money cents={offer.amount} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Asking</dt>
              <dd className="text-sm tabular text-primary">
                <Money cents={offer.originalPrice} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Difference</dt>
              <dd className={cn("text-sm font-medium tabular", below ? "text-warning" : "text-success")}>
                {below ? "−" : "+"}
                <Money cents={Math.abs(m.differenceCents)} /> <span className="text-xs font-normal">({signedPct(m.differencePct)})</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Est. profit after fees</dt>
              <dd className="text-sm font-medium tabular text-primary">
                {m.estimatedProfitCents === null ? (
                  <span className="font-normal text-muted" title="Add what you paid for the item to see profit">
                    net <Money cents={m.netCents} /> · cost unknown
                  </span>
                ) : (
                  <span className={m.estimatedProfitCents < 0 ? "text-danger" : undefined}>
                    <Money cents={m.estimatedProfitCents} /> <span className="text-xs font-normal text-muted">(fees <Money cents={m.feesCents} />)</span>
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {offer.message && (
            <blockquote className="flex items-start gap-2 rounded-xs bg-surface-sunken px-3 py-2 text-sm text-secondary">
              <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="whitespace-pre-line">{offer.message}</span>
            </blockquote>
          )}

          {offer.status === "COUNTERED" && offer.counterAmount && (
            <p className="text-sm text-secondary">
              You countered at <Money cents={offer.counterAmount} className="font-medium text-primary" />
              {offer.responseMessage ? ` — “${offer.responseMessage}”` : ""}.
            </p>
          )}

          {open && (
            <div className="space-y-3">
              {offer.manualReply && (
                <div className="rounded-xs border border-info/30 bg-info-soft px-3 py-2 text-sm">
                  <p className="font-medium text-primary">Reply on {offer.marketplaceName}, then record the outcome here.</p>
                  <p className="mt-0.5 text-xs text-secondary">
                    {offer.mode === "assisted" ? `${offer.marketplaceName} has no offers API, so Clover cannot send replies.` : "This offer was logged by hand, so Clover cannot send a reply for it."}
                    {offer.publication?.externalUrl && (
                      <>
                        {" "}
                        <a href={offer.publication.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                          Open your listing <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </>
                    )}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setDialog("accept")} disabled={busy}>
                  {offer.manualReply ? "Record accepted" : "Accept"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setPreset(null); setDialog("counter"); }} disabled={busy}>
                  {offer.manualReply ? "Record counter" : "Counter"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDialog("decline")} disabled={busy}>
                  {offer.manualReply ? "Record declined" : "Decline"}
                </Button>
                <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline">
                  Suggestion <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                </button>
              </div>
              {expanded && (
                <SuggestionPanel
                  suggestion={suggestion}
                  loading={advising}
                  error={adviceError}
                  onRetry={advise}
                  onUseCounter={(cents, message) => {
                    setPreset({ cents, message });
                    setDialog("counter");
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <AcceptDialog offer={offer} open={dialog === "accept"} onOpenChange={(o) => !o && setDialog(null)} onConfirm={() => respond("accept")} busy={busy} />
      <DeclineDialog offer={offer} open={dialog === "decline"} onOpenChange={(o) => !o && setDialog(null)} onConfirm={(msg) => respond("decline", undefined, msg)} busy={busy} />
      <CounterDialog offer={{ ...offer, suggestion }} open={dialog === "counter"} onOpenChange={(o) => !o && setDialog(null)} onConfirm={(cents, msg) => respond("counter", cents, msg)} busy={busy} preset={preset} />
    </motion.li>
  );
}

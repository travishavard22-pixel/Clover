"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, MoneyInput, Textarea } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { MonogramTile } from "@/components/marketplaces/monogram-tile";
import type { OfferDTO } from "@/lib/offers";
import { validateCounter } from "@/lib/offers/decision";
import { MARKETPLACES } from "@/lib/marketplaces/registry";

type Busy = boolean;

/**
 * Accept: names the price, the estimated fee and net, and every other live listing the
 * double-sell guard will end (automatically) or hand to the seller (assisted).
 */
export function AcceptDialog({ offer, open, onOpenChange, onConfirm, busy }: { offer: OfferDTO; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (message?: string) => void; busy: Busy }) {
  const others = offer.otherLivePublications;
  const auto = others.filter((o) => o.automatic);
  const manual = others.filter((o) => !o.automatic);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" title={`Accept ${formatMoney(offer.amount)} from ${offer.buyerName}?`} description={offer.manualReply ? `Accept on ${offer.marketplaceName} first, then record it here. Clover marks the item sold and guards your other listings.` : `Clover sends the acceptance to ${offer.marketplaceName} and marks the item sold.`}>
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 rounded-sm border border-border-subtle bg-surface-sunken px-3 py-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Sale price</dt>
              <dd className="font-semibold tabular text-primary">
                <Money cents={offer.amount} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Est. fees</dt>
              <dd className="tabular text-primary">
                <Money cents={offer.math.feesCents} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">You keep</dt>
              <dd className="font-semibold tabular text-primary">
                <Money cents={offer.math.netCents} />
              </dd>
            </div>
          </dl>
          {others.length > 0 ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium text-primary">Double-sell guard</p>
              <ul className="space-y-1.5">
                {others.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 text-secondary">
                    <MonogramTile shortName={MARKETPLACES[o.marketplace].shortName} name={o.name} color={MARKETPLACES[o.marketplace].color} size="sm" />
                    <span className="min-w-0 flex-1">
                      {o.name}: {o.automatic ? "Clover ends it for you" : "you end it yourself — Clover gives you the link"}
                    </span>
                    {o.externalUrl && (
                      <a href={o.externalUrl} target="_blank" rel="noopener noreferrer" className="text-accent-text" aria-label={`Open the ${o.name} listing (new tab)`}>
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {manual.length > 0 && <p className="text-xs text-secondary">The {manual.map((m) => m.name).join(" and ")} listing{manual.length > 1 ? "s" : ""} will show as “Your turn” in Listings until you confirm.</p>}
              {auto.length > 0 && manual.length === 0 && <p className="text-xs text-secondary">Ending happens right after you accept; progress shows in Listings.</p>}
            </div>
          ) : (
            <p className="text-sm text-secondary">No other live listings for this item — nothing else to end.</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Not yet
            </Button>
            <Button onClick={() => onConfirm()} loading={busy}>
              {offer.manualReply ? "Record as accepted" : "Accept offer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeclineDialog({ offer, open, onOpenChange, onConfirm, busy }: { offer: OfferDTO; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (message?: string) => void; busy: Busy }) {
  const [message, setMessage] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title={`Decline ${formatMoney(offer.amount)}?`} description={offer.manualReply ? `Decline on ${offer.marketplaceName}, then record it here.` : `Clover sends the decline to ${offer.marketplaceName}. The listing stays live.`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(message.trim() || undefined);
          }}
        >
          {!offer.manualReply && (
            <Field label="Message to the buyer" optional hint="Up to 250 characters.">
              {(f) => <Textarea {...f} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 250))} rows={3} placeholder="Thanks for the offer — I can't go that low on this one." />}
            </Field>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Keep it open
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              {offer.manualReply ? "Record as declined" : "Decline"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CounterDialog({ offer, open, onOpenChange, onConfirm, busy, preset }: { offer: OfferDTO; open: boolean; onOpenChange: (o: boolean) => void; onConfirm: (counterCents: number, message?: string) => void; busy: Busy; preset: { cents: number; message: string } | null }) {
  const [cents, setCents] = useState<number | null>(preset?.cents ?? null);
  const [message, setMessage] = useState(preset?.message ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCents(preset?.cents ?? offer.suggestion?.counterAmountCents ?? null);
      setMessage(preset?.message ?? (offer.suggestion?.recommendation === "counter" ? offer.suggestion.suggestedMessage : ""));
      setError(null);
    }
  }, [open, preset, offer.suggestion]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = cents === null ? "Enter a counter amount." : validateCounter(cents, offer.amount, offer.originalPrice);
    if (err) {
      setError(err);
      return;
    }
    onConfirm(cents!, message.trim() || undefined);
  };
  const pctOfAsk = cents && offer.originalPrice ? Math.round((cents / offer.originalPrice) * 100) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Counter offer" description={offer.manualReply ? `Send the counter on ${offer.marketplaceName}, then record it here so Clover can track it.` : `Clover sends the counter to ${offer.marketplaceName}.`}>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Your counter" hint={`Between ${formatMoney(offer.amount + 1)} and your asking price of ${formatMoney(offer.originalPrice)}.${pctOfAsk ? ` That is ${pctOfAsk}% of asking.` : ""}`} error={error}>
            {(f) => <MoneyInput {...f} valueCents={cents} onChangeCents={(v) => { setCents(v); setError(null); }} autoFocus />}
          </Field>
          <Field label="Message" optional hint="Up to 250 characters.">
            {(f) => <Textarea {...f} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 250))} rows={3} />}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {offer.manualReply ? "Record counter" : "Send counter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}

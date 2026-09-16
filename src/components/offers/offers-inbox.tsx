"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/card";
import type { OfferDTO } from "@/lib/offers";
import { LogOfferDialog } from "./log-offer-dialog";
import { OfferCard } from "./offer-card";
import type { OfferableItem } from "./offers-api";

/** The offers inbox: pending first, then everything else. Every card carries the numbers and a suggestion on demand. */
export function OffersInbox({ initial, items, focusId }: { initial: OfferDTO[]; items: OfferableItem[]; focusId: string | null }) {
  const [offers, setOffers] = useState(initial);
  const [logOpen, setLogOpen] = useState(false);
  const pending = offers.filter((o) => o.status === "PENDING");
  const rest = offers.filter((o) => o.status !== "PENDING");

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`offer-${focusId}`);
    el?.scrollIntoView({ block: "center" });
  }, [focusId]);

  const onChanged = (updated: OfferDTO) => {
    setOffers((os) => {
      const next = os.map((o) => (o.id === updated.id ? updated : o));
      // Accepting sells the item: sibling pending offers on it expire server-side; mirror that here.
      if (updated.status === "ACCEPTED") return next.map((o) => (o.id !== updated.id && o.item.id === updated.item.id && o.status === "PENDING" ? { ...o, status: "EXPIRED" as const } : o));
      return next;
    });
  };

  const onLogged = (offer: OfferDTO) => setOffers((os) => [offer, ...os]);

  const logButton = (
    <Button variant="outline" onClick={() => setLogOpen(true)} leadingIcon={<Plus className="size-4" aria-hidden />}>
      Log an offer
    </Button>
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-secondary">{pending.length ? `${pending.length} waiting for you` : "Nothing waiting"}</p>
        {logButton}
      </div>

      {offers.length === 0 ? (
        <EmptyState
          title="No offers yet"
          description="Offers from eBay arrive here on sync. For other marketplaces, log the offer and Clover does the math and suggests a reply."
          icon={<Inbox className="size-8" strokeWidth={1.5} />}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {logButton}
              <Link href="/listings" className={buttonClasses("ghost", "md")}>
                See listings
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <section aria-labelledby="pending-heading" className="space-y-3">
            <h2 id="pending-heading" className="text-sm font-medium text-secondary">
              Waiting for you
            </h2>
            {pending.length === 0 ? (
              <p className="rounded-sm border border-dashed border-border-default px-4 py-6 text-center text-sm text-secondary">All caught up.</p>
            ) : (
              <ul className="space-y-3">
                {pending.map((o, i) => (
                  <OfferCard key={o.id} offer={o} onChanged={onChanged} focused={o.id === focusId} index={i} />
                ))}
              </ul>
            )}
          </section>
          {rest.length > 0 && (
            <section aria-labelledby="history-heading" className="space-y-3">
              <h2 id="history-heading" className="text-sm font-medium text-secondary">
                Earlier
              </h2>
              <ul className="space-y-3">
                {rest.map((o, i) => (
                  <OfferCard key={o.id} offer={o} onChanged={onChanged} focused={o.id === focusId} index={i} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <LogOfferDialog open={logOpen} onOpenChange={setLogOpen} items={items} onLogged={onLogged} />
    </div>
  );
}

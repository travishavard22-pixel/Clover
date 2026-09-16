"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Marketplace } from "@/lib/db";
import { MARKETPLACE_ORDER } from "@/lib/marketplaces/labels";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import type { OfferDTO } from "@/lib/offers";
import { RequestError } from "@/components/marketplaces/api-client";
import { offersApi, type OfferableItem } from "./offers-api";

/**
 * "Log an offer": records an offer that arrived on a marketplace Clover cannot read (assisted
 * channels, or anywhere the buyer messaged you directly) so it gets the same math and advice.
 */
export function LogOfferDialog({ open, onOpenChange, items, onLogged }: { open: boolean; onOpenChange: (o: boolean) => void; items: OfferableItem[]; onLogged: (offer: OfferDTO) => void }) {
  const [itemId, setItemId] = useState<string>(items[0]?.id ?? "");
  const [marketplace, setMarketplace] = useState<Marketplace | "">("");
  const [buyer, setBuyer] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const item = useMemo(() => items.find((i) => i.id === itemId) ?? null, [items, itemId]);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!itemId && items[0]) setItemId(items[0].id);
  }, [open, items, itemId]);
  useEffect(() => {
    if (item && !marketplace) setMarketplace((item.marketplaces[0] as Marketplace | undefined) ?? "");
  }, [item, marketplace]);

  const marketplaceOptions = useMemo(() => {
    const live = new Set(item?.marketplaces ?? []);
    return MARKETPLACE_ORDER.map((m) => ({ value: m, label: MARKETPLACES[m].name, description: live.has(m) ? "Listed here" : undefined })).sort((a, b) => Number(live.has(b.value)) - Number(live.has(a.value)));
  }, [item]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!itemId) next.itemId = "Choose the item.";
    if (!marketplace) next.marketplace = "Where did the offer come from?";
    if (!buyer.trim()) next.buyerName = "Who made the offer?";
    if (!amount || amount < 1) next.amountCents = "Enter the offer amount.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const res = await offersApi.log({ itemId, marketplace: marketplace as Marketplace, buyerName: buyer.trim(), amountCents: amount!, message: message.trim() || undefined });
      onLogged(res.offer);
      toast.success("Offer logged", { description: `${buyer.trim()} · ${(amount! / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} on ${MARKETPLACES[marketplace as Marketplace].name}` });
      onOpenChange(false);
      setBuyer("");
      setAmount(null);
      setMessage("");
    } catch (err) {
      if (err instanceof RequestError && Array.isArray(err.details)) {
        const fieldErrors: Record<string, string> = {};
        for (const d of err.details as Array<{ path?: string; message?: string }>) if (d.path && d.message) fieldErrors[d.path] = d.message;
        setErrors(fieldErrors);
      }
      toast.error(err instanceof Error ? err.message : "Couldn't log the offer. Your entries are kept.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" title="Log an offer" description="For offers that arrive where Clover cannot read them — assisted marketplaces, messages, in person. You get the same math and suggestion.">
        {items.length === 0 ? (
          <p className="text-sm text-secondary">No items are ready or listed right now. Publish an item first, then log offers against it.</p>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Item" error={errors.itemId}>
              {(f) => <Select id={f.id} aria-label="Item" value={itemId} onValueChange={(v) => { setItemId(v); setMarketplace(""); }} options={items.map((i) => ({ value: i.id, label: i.title, description: `${i.sku}${i.listPrice ? ` · listed at ${(i.listPrice / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : ""}` }))} placeholder="Choose an item" />}
            </Field>
            <Field label="Marketplace" error={errors.marketplace}>
              {(f) => <Select id={f.id} aria-label="Marketplace" value={marketplace || undefined} onValueChange={(v) => setMarketplace(v as Marketplace)} options={marketplaceOptions} placeholder="Where the offer came from" />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Buyer" error={errors.buyerName}>
                {(f) => <Input {...f} value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Name or handle" maxLength={80} autoComplete="off" />}
              </Field>
              <Field label="Offer amount" error={errors.amountCents} hint={item?.listPrice ? `Asking ${(item.listPrice / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : undefined}>
                {(f) => <MoneyInput {...f} valueCents={amount} onChangeCents={setAmount} />}
              </Field>
            </div>
            <Field label="Their message" optional>
              {(f) => <Textarea {...f} value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={3} placeholder="Paste what they wrote, if anything" />}
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                Log offer
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

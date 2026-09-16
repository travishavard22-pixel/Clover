"use client";
import { useState } from "react";
import { ExternalLink, MoreHorizontal, RefreshCw, Tag, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, MoneyInput } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Money } from "@/components/ui/money";
import type { PublicationDTO } from "@/lib/marketplaces/publications";
import { publishApi, type PublicationMutation } from "./publish-api";

export type PublishedActionsProps = {
  publication: PublicationDTO;
  marketplaceName: string;
  /** API rows queue a job; assisted rows hand the step to the seller. */
  assisted: boolean;
  onChanged: (result: PublicationMutation) => void;
  /** `menu` packs everything behind one button for dense boards. */
  layout?: "inline" | "menu";
  /** Extra menu entries the host wants (e.g. "View item"). */
  extraMenu?: React.ReactNode;
};

/** View / Update price / End listing / Re-publish for one publication, with confirmations that say what will happen. */
export function PublishedActions({ publication: p, marketplaceName, assisted, onChanged, layout = "inline", extraMenu }: PublishedActionsProps) {
  const [dialog, setDialog] = useState<"end" | "price" | null>(null);
  const [busy, setBusy] = useState<"end" | "price" | "republish" | null>(null);
  const [price, setPrice] = useState<number | null>(p.price);
  const [priceError, setPriceError] = useState<string | null>(null);

  const live = p.status === "PUBLISHED";
  const canRepublish = p.status === "ENDED" || p.status === "FAILED" || p.status === "NEEDS_ATTENTION";

  const run = async <T,>(kind: "end" | "price" | "republish", fn: () => Promise<T>, onOk: (r: T) => void) => {
    setBusy(kind);
    try {
      onOk(await fn());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That didn't work. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const end = () =>
    run("end", () => publishApi.end(p.id, false), (r) => {
      onChanged(r);
      setDialog(null);
      if (r.jobId) toast.success(`Ending on ${marketplaceName}`, { description: "Progress shows on the row." });
      else if (r.publication.status === "REQUIRES_USER_ACTION") toast(`End it on ${marketplaceName}, then confirm`, { description: "Clover cannot end assisted listings for you." });
      else toast.success(`Ended on ${marketplaceName}`);
    });

  const reprice = () => {
    if (!price || price < 99) {
      setPriceError("Enter a price of at least $0.99.");
      return;
    }
    setPriceError(null);
    run("price", () => publishApi.price(p.id, price), (r) => {
      onChanged(r);
      setDialog(null);
      if (r.jobId) toast.success(`Updating the ${marketplaceName} price`, { description: "Progress shows on the row." });
      else toast(`Change the price on ${marketplaceName}, then confirm`, { description: "The checklist has the new price ready to copy." });
    });
  };

  const republish = () =>
    run("republish", () => publishApi.republish(p.id), (r) => {
      onChanged(r);
      toast.success(r.jobId ? `Publishing to ${marketplaceName} again` : `Checklist ready for ${marketplaceName}`);
    });

  const viewLink = p.externalUrl ? (
    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "sm")}>
      <ExternalLink className="size-4" aria-hidden />
      View listing<span className="sr-only"> on {marketplaceName} (opens in a new tab)</span>
    </a>
  ) : null;

  const dialogs = (
    <>
      <Dialog open={dialog === "end"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm" title={`End the ${marketplaceName} listing?`} description={assisted ? `Clover cannot end listings on ${marketplaceName}. You end it there yourself; Clover gives you the link and records that you did.` : `Buyers on ${marketplaceName} will no longer see it. You can publish again later.`}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Keep it live
            </Button>
            <Button variant="danger" onClick={end} loading={busy === "end"}>
              {assisted ? "Show me how to end it" : "End listing"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "price"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm" title="Update price" description={assisted ? `You change it on ${marketplaceName}; Clover prepares the number and records it once you confirm.` : `Clover sends the new price to ${marketplaceName}.`}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              reprice();
            }}
          >
            <Field label="New price" hint={p.price ? `Currently ${(p.price / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : undefined} error={priceError}>
              {(f) => <MoneyInput {...f} valueCents={price} onChangeCents={setPrice} autoFocus />}
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy === "price"}>
                {assisted ? "Prepare the change" : "Update price"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  if (layout === "menu") {
    return (
      <>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for the ${marketplaceName} listing`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {p.externalUrl && (
              <MenuItem asChild>
                <a href={p.externalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden /> View on {marketplaceName}
                </a>
              </MenuItem>
            )}
            {extraMenu}
            {(p.externalUrl || extraMenu) && (live || canRepublish) && <MenuSeparator />}
            {live && (
              <MenuItem onSelect={() => setDialog("price")}>
                <Tag className="size-4" aria-hidden /> Update price
              </MenuItem>
            )}
            {canRepublish && (
              <MenuItem onSelect={republish} disabled={busy !== null}>
                <RefreshCw className="size-4" aria-hidden /> Re-publish
              </MenuItem>
            )}
            {live && (
              <MenuItem destructive onSelect={() => setDialog("end")}>
                <XCircle className="size-4" aria-hidden /> End listing
              </MenuItem>
            )}
          </MenuContent>
        </Menu>
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {viewLink}
      {live && (
        <Button size="sm" variant="outline" leadingIcon={<Tag className="size-4" aria-hidden />} onClick={() => setDialog("price")}>
          Update price
        </Button>
      )}
      {live && (
        <Button size="sm" variant="ghost" leadingIcon={<XCircle className="size-4" aria-hidden />} onClick={() => setDialog("end")}>
          End listing
        </Button>
      )}
      {canRepublish && (
        <Button size="sm" variant="outline" leadingIcon={<RefreshCw className="size-4" aria-hidden />} onClick={republish} loading={busy === "republish"}>
          Re-publish
        </Button>
      )}
      {p.price !== null && live && (
        <span className="text-xs text-muted">
          Listed at <Money cents={p.price} className="text-secondary" />
        </span>
      )}
      {dialogs}
    </div>
  );
}

"use client";
import { useState } from "react";
import { Check, ChevronDown, ListFilter, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { AiBadge, Badge, ConfidenceBadge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MoneyInput } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { Switch } from "@/components/ui/switch";
import type { ItemSummary } from "@/lib/items/summary";
import { cn } from "@/lib/utils/cn";
import { CompsDrawer } from "./comps-drawer";
import { errorMessage } from "./item-api";
import { MethodTable } from "./method-table";
import { NetTable } from "./net-table";
import { RangeBar } from "./range-bar";

type PointKey = "quickSale" | "recommended" | "maxValue";
const POINTS: Array<{ key: PointKey; label: string; hint: string }> = [
  { key: "quickSale", label: "Quick sale", hint: "Sells in days" },
  { key: "recommended", label: "Recommended", hint: "Best balance" },
  { key: "maxValue", label: "Maximum value", hint: "Patient sale" },
];

/**
 * The estimate, the three price points as selectable cards, the range, the plain-language basis,
 * take-home by marketplace, a custom price, comparables and (in expert mode) the method.
 */
export function PricingCard({
  summary,
  onListPrice,
  onRecalculate,
  onToggleComp,
}: {
  summary: ItemSummary;
  onListPrice: (cents: number) => Promise<void>;
  onRecalculate: () => Promise<void>;
  onToggleComp: (compId: string, included: boolean) => Promise<void>;
}) {
  const { estimate, item, comps } = summary;
  const [customDraft, setCustom] = useState<number | null | undefined>(undefined);
  const custom = customDraft === undefined ? item.listPrice : customDraft;
  const [busy, setBusy] = useState<"price" | "recalc" | null>(null);
  const [compsOpen, setCompsOpen] = useState(false);
  const [expert, setExpert] = useState(summary.prefs.expertMode);
  const [methodOpen, setMethodOpen] = useState(false);
  const reduce = useReducedMotion();

  const select = async (cents: number) => {
    if (cents === item.listPrice) return;
    setBusy("price");
    try {
      await onListPrice(cents);
      setCustom(undefined);
    } catch (err) {
      toast.error("Couldn't set the price", { description: errorMessage(err), action: { label: "Retry", onClick: () => void select(cents) } });
    } finally {
      setBusy(null);
    }
  };

  const recalc = async () => {
    setBusy("recalc");
    try {
      await onRecalculate();
    } catch (err) {
      toast.error("Couldn't recalculate", { description: errorMessage(err), action: { label: "Retry", onClick: () => void recalc() } });
    } finally {
      setBusy(null);
    }
  };

  if (!estimate) {
    return (
      <Card id="pricing">
        <CardHeader title="Price" description="No estimate yet. Analysis searches comparable listings and prices the item." />
        {item.listPrice !== null && (
          <CardBody>
            <p className="text-sm text-secondary">
              List price <Money cents={item.listPrice} className="font-medium text-primary" />
            </p>
          </CardBody>
        )}
      </Card>
    );
  }

  const market = estimate.basis === "MARKET_EVIDENCE";
  const basisLabel = market ? `From ${estimate.compsUsed} ${estimate.compsProvider === "ebay" ? "eBay" : "comparable"} listing${estimate.compsUsed === 1 ? "" : "s"}` : estimate.compsUsed > 0 ? `AI estimate — ${estimate.compsUsed} demo comparable${estimate.compsUsed === 1 ? "" : "s"}, not market evidence` : "AI estimate — no comparable listings found";
  const selectedPoint = POINTS.find((p) => estimate[p.key] === item.listPrice)?.key ?? null;
  const isCustom = item.listPrice !== null && selectedPoint === null;

  return (
    <Card id="pricing">
      <CardHeader
        title="Price"
        description={estimate.explanation}
        action={
          <div className="flex flex-col items-end gap-1">
            <ConfidenceBadge tier={estimate.confidence} score={estimate.effectiveSample / Math.max(estimate.effectiveSample, 8)} expert={false} />
            {estimate.demo ? <DemoBadge /> : market ? <Badge tone="success">Market evidence</Badge> : <AiBadge />}
          </div>
        }
      />
      <CardBody className="space-y-5">
        <div role="radiogroup" aria-label="Choose a list price" className="grid gap-2 sm:grid-cols-3">
          {POINTS.map((p) => {
            const cents = estimate[p.key];
            const active = selectedPoint === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy !== null}
                onClick={() => void select(cents)}
                className={cn(
                  "relative flex flex-col items-start rounded-sm border p-3 text-left transition-colors hover:border-accent focus-visible:border-accent disabled:opacity-60",
                  active ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-raised",
                  p.key === "recommended" && !active && "border-border-default",
                )}
              >
                <span className="text-xs uppercase tracking-wide text-muted">{p.label}</span>
                <Money cents={cents} className={cn("mt-0.5 text-xl font-semibold", active ? "text-accent-text" : "text-primary")} />
                <span className="text-xs text-secondary">{p.hint}</span>
                {active && (
                  <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-accent text-on-accent" aria-hidden>
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <RangeBar low={estimate.low} likely={estimate.likely} high={estimate.high} selected={item.listPrice} />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn("font-medium", market ? "text-success" : "text-info")}>{basisLabel}</span>
          <span className="text-muted" aria-hidden>
            ·
          </span>
          <Button variant="link" size="sm" onClick={() => setCompsOpen(true)} leadingIcon={<ListFilter className="size-4" aria-hidden />}>
            {comps.length ? `Review ${comps.length} comparable${comps.length === 1 ? "" : "s"}` : "Comparables"}
          </Button>
        </div>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom !== null && custom > 0) void select(custom);
          }}
        >
          <div className="w-40">
            <label htmlFor="custom-price" className="text-xs uppercase tracking-wide text-muted">
              {isCustom ? "Your list price" : "Custom price"}
            </label>
            <MoneyInput id="custom-price" valueCents={custom} onChangeCents={setCustom} className="mt-1" placeholder="0" />
          </div>
          <Button type="submit" variant="secondary" disabled={custom === null || custom <= 0 || custom === item.listPrice} loading={busy === "price"}>
            Set price
          </Button>
          <Button type="button" variant="ghost" onClick={() => void recalc()} loading={busy === "recalc"} leadingIcon={<RefreshCw className="size-4" aria-hidden />}>
            Recalculate
          </Button>
          <span className="text-xs text-muted">Updated {new Date(estimate.updatedAt).toLocaleString()}</span>
        </form>

        {estimate.netByMarketplace && (
          <details className="group rounded-sm border border-border-subtle" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-primary">
              Take-home by marketplace
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="px-3 pb-3">
              <NetTable net={estimate.netByMarketplace} defaults={summary.prefs.defaultMarketplaces} />
            </div>
          </details>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <label htmlFor="expert-toggle" className="text-sm text-secondary">
            Show how this was calculated
          </label>
          <Switch
            id="expert-toggle"
            checked={expert && methodOpen}
            onCheckedChange={(v) => {
              setExpert(true);
              setMethodOpen(v);
            }}
          />
        </div>
        <AnimatePresence initial={false}>
          {expert && methodOpen && estimate.method && (
            <motion.div key="method" initial={reduce ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}>
              <MethodTable method={estimate.method} />
            </motion.div>
          )}
        </AnimatePresence>
      </CardBody>
      <CompsDrawer open={compsOpen} onClose={() => setCompsOpen(false)} comps={comps} onToggle={onToggleComp} />
    </Card>
  );
}

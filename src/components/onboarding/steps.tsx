"use client";
import Link from "next/link";
import { Camera, Check, ExternalLink, Link2, Sparkles, Store, Tag } from "lucide-react";
import type { Marketplace } from "@/lib/db";
import type { OnboardingConnection } from "@/lib/onboarding";
import type { PreferencesPatch } from "@/lib/settings/schema";
import { PRICING_STRATEGY_COPY, PRICING_STRATEGIES } from "@/lib/settings/schema";
import { MARKETPLACES, PRIMARY_MARKETPLACES } from "@/lib/marketplaces/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SettingRow, Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils/cn";

export type Draft = Required<Pick<PreferencesPatch, "defaultMarketplaces" | "offersShipping" | "offersLocalPickup" | "defaultShippingNote" | "city" | "region" | "postalCode" | "pricingStrategy" | "notifyOffers" | "notifyStale" | "notifyPublishing" | "notifyEmail">>;
export type StepProps = { draft: Draft; set: <K extends keyof Draft>(key: K, value: Draft[K]) => void };

export function Headline({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h1 className={cn("serif-display text-4xl text-primary sm:text-5xl", className)}>{children}</h1>;
}
export function Lede({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-lg text-base text-secondary">{children}</p>;
}

// ───────────────────────────── 0. Welcome ─────────────────────────────
export function StepWelcome({ firstName }: { firstName: string }) {
  const steps = [
    { icon: Camera, label: "Photograph it" },
    { icon: Sparkles, label: "Clover identifies, grades and prices it" },
    { icon: Tag, label: "Publish everywhere you sell" },
  ];
  return (
    <div>
      <Headline>
        Hello, {firstName}. <br className="hidden sm:block" />
        Photograph it. It&apos;s for sale.
      </Headline>
      <Lede>A few questions so Clover prices and lists things the way you sell. It takes about two minutes, and you can change anything later in Settings.</Lede>
      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3 rounded-sm border border-border-subtle bg-surface-raised p-4 sm:flex-col sm:items-start">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <s.icon className="size-4" aria-hidden />
            </span>
            <span className="text-sm text-primary">
              <span className="tabular text-muted">{i + 1}. </span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───────────────────────────── 1. How it works ─────────────────────────────
export function StepHowItWorks() {
  const cards = [
    { title: "Identify and grade", body: "Clover reads your photos and returns a typed profile: brand, model, condition, defects. Every field carries a confidence tier — Confident, Likely or Needs check — and points to the photo it came from." },
    { title: "Price from evidence", body: "Prices come from sold comparables when they exist. When they don't, you get an estimate that is labelled as an estimate, never dressed up as market data." },
    { title: "Publish, with you in control", body: "eBay publishes through its official API. Facebook, OfferUp and Nextdoor are assisted: Clover prepares everything and you post it yourself in about a minute." },
  ];
  return (
    <div>
      <Headline>Three steps, no guessing.</Headline>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-sm border border-border-subtle bg-surface-raised p-5">
            <h2 className="text-base font-semibold text-primary">{c.title}</h2>
            <p className="mt-2 text-sm text-secondary">{c.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 flex items-start gap-2 rounded-sm bg-accent-soft/60 p-4 text-sm text-primary">
        <Check className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
        <span>
          <span className="font-medium">Our promise:</span> Clover says what it knows, says what it doesn&apos;t, and never changes a live listing or a price without your say-so.
        </span>
      </p>
    </div>
  );
}

// ───────────────────────────── 2. Connect marketplaces ─────────────────────────────

export function StepConnect({ connections, returnTo, demo }: { connections: OnboardingConnection[]; returnTo: string; demo: boolean }) {
  const byMarket = new Map(connections.map((c) => [c.marketplace, c]));
  return (
    <div>
      <Headline>Where do you sell?</Headline>
      <Lede>Connect eBay now to publish through its API. The others need no connection — Clover prepares the listing and you post it yourself. You can do all of this later from Connections.</Lede>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {PRIMARY_MARKETPLACES.map((m) => {
          const info = MARKETPLACES[m];
          const conn = byMarket.get(m);
          const connected = conn?.status === "CONNECTED";
          const api = info.mode === "api";
          return (
            <li key={m} className="flex flex-col rounded-sm border border-border-subtle bg-surface-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full text-inverse" style={{ background: info.color }} aria-hidden>
                    <Store className="size-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-primary">{info.name}</h2>
                    <Badge tone={api ? "info" : "neutral"} className="mt-1">
                      {api ? "API publishing" : info.mode === "api_or_assisted" ? "Assisted (API pending)" : "Assisted publishing"}
                    </Badge>
                  </div>
                </div>
                {connected && (
                  <Badge tone="success">
                    <Check className="size-3" aria-hidden /> {conn?.mode === "demo" || demo ? "Demo" : "Connected"}
                  </Badge>
                )}
              </div>
              <p className="mt-3 flex-1 text-sm text-secondary">{info.modeExplanation}</p>
              <div className="mt-4">
                {api || info.mode === "api_or_assisted" ? (
                  <Link href={`/connections?returnTo=${encodeURIComponent(returnTo)}`} className={buttonClasses(connected ? "outline" : "secondary", "sm")}>
                    <Link2 className="size-4" aria-hidden />
                    {connected ? "Manage connection" : `Connect ${info.shortName}`}
                  </Link>
                ) : (
                  <span className="text-xs text-muted">Nothing to connect — you&apos;ll post from Clover&apos;s checklist.</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Clover uses official APIs only. It never asks for marketplace passwords or automates a marketplace&apos;s website.{" "}
        <Link href="/help" className="text-accent-text underline-offset-4 hover:underline">
          How assisted publishing works <ExternalLink className="inline size-3" aria-hidden />
        </Link>
      </p>
    </div>
  );
}

// ───────────────────────────── 3. Selling preferences ─────────────────────────────
export function StepSelling({ draft, set }: StepProps) {
  const toggleMarket = (m: Marketplace) => {
    const has = draft.defaultMarketplaces.includes(m);
    set("defaultMarketplaces", has ? draft.defaultMarketplaces.filter((x) => x !== m) : [...draft.defaultMarketplaces, m]);
  };
  const neither = !draft.offersShipping && !draft.offersLocalPickup;
  return (
    <div>
      <Headline>How do you like to sell?</Headline>
      <Lede>These become the defaults for every new listing. Each item can still differ.</Lede>
      <fieldset className="mt-8">
        <legend className="text-sm font-medium text-primary">Marketplaces to prepare by default</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PRIMARY_MARKETPLACES.map((m) => {
            const info = MARKETPLACES[m];
            const on = draft.defaultMarketplaces.includes(m);
            return (
              <label key={m} className={cn("flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors", on ? "border-accent bg-accent-soft/40" : "border-border-subtle bg-surface-raised hover:border-border-default")}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleMarket(m)} />
                <span className={cn("flex size-5 items-center justify-center rounded-[5px] border", on ? "border-accent bg-accent text-on-accent" : "border-border-strong")} aria-hidden>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-primary">{info.name}</span>
                  <span className="block text-xs text-secondary">{info.mode === "api" ? "Publishes through the API" : "Assisted — you post it"}</span>
                </span>
              </label>
            );
          })}
        </div>
        {draft.defaultMarketplaces.length === 0 && <p className="mt-2 text-xs text-warning">With none selected, Clover prepares a generic listing you can send anywhere.</p>}
      </fieldset>
      <div className="mt-6 divide-y divide-border-subtle rounded-sm border border-border-subtle bg-surface-raised px-4">
        <SettingRow label="I ship items" description="Adds shipping options and a packing note to listings." control={<Switch checked={draft.offersShipping} onCheckedChange={(v) => set("offersShipping", v)} aria-label="I ship items" />} />
        <SettingRow label="I offer local pickup" description="Facebook, OfferUp and Nextdoor buyers usually collect in person." control={<Switch checked={draft.offersLocalPickup} onCheckedChange={(v) => set("offersLocalPickup", v)} aria-label="I offer local pickup" />} />
      </div>
      {neither && (
        <p className="mt-2 text-sm text-danger" role="alert">
          Keep at least one on, or buyers have no way to receive the item.
        </p>
      )}
      {draft.offersShipping && (
        <Field label="Shipping note" hint="Shown to buyers on marketplaces that support it, e.g. “Ships within 2 business days from Portland, OR.”" optional className="mt-6">
          {(p) => <Textarea {...p} value={draft.defaultShippingNote ?? ""} maxLength={280} onChange={(e) => set("defaultShippingNote", e.target.value || null)} className="min-h-20" />}
        </Field>
      )}
    </div>
  );
}

// ───────────────────────────── 4. Location ─────────────────────────────
export function StepLocation({ draft, set }: StepProps) {
  return (
    <div>
      <Headline>Where are you?</Headline>
      <Lede>Local marketplaces list by city, and shipping estimates need an origin. Clover asks rather than guessing from your device.</Lede>
      <div className="mt-8 grid gap-4 sm:grid-cols-6">
        <Field label="City" className="sm:col-span-3">
          {(p) => <Input {...p} value={draft.city ?? ""} autoComplete="address-level2" onChange={(e) => set("city", e.target.value || null)} />}
        </Field>
        <Field label="State or region" className="sm:col-span-2">
          {(p) => <Input {...p} value={draft.region ?? ""} autoComplete="address-level1" onChange={(e) => set("region", e.target.value || null)} />}
        </Field>
        <Field label="Postal code" className="sm:col-span-1">
          {(p) => <Input {...p} value={draft.postalCode ?? ""} inputMode="numeric" autoComplete="postal-code" className="tabular" onChange={(e) => set("postalCode", e.target.value || null)} />}
        </Field>
      </div>
      <p className="mt-3 text-xs text-muted">Only the city and region ever appear on a listing. The postal code stays private and is used for shipping estimates.</p>
    </div>
  );
}

// ───────────────────────────── 5. Pricing strategy ─────────────────────────────
export function StepPricing({ draft, set }: StepProps) {
  return (
    <div>
      <Headline>How do you want to price?</Headline>
      <Lede>Clover always shows the full estimate band. This picks where in the band each new listing starts.</Lede>
      <div role="radiogroup" aria-label="Pricing strategy" className="mt-8 grid gap-3 md:grid-cols-3">
        {PRICING_STRATEGIES.map((s) => {
          const on = draft.pricingStrategy === s;
          const copy = PRICING_STRATEGY_COPY[s];
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set("pricingStrategy", s)}
              className={cn("rounded-sm border p-5 text-left transition-colors", on ? "border-accent bg-accent-soft/40" : "border-border-subtle bg-surface-raised hover:border-border-default")}
            >
              <span className="flex items-center justify-between">
                <span className="text-base font-semibold text-primary">{copy.label}</span>
                {on && <Check className="size-4 text-accent-text" aria-hidden />}
              </span>
              <span className="mt-2 block text-sm text-secondary">{copy.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── 6. Notifications ─────────────────────────────
export function StepNotifications({ draft, set }: StepProps) {
  return (
    <div>
      <Headline>What should Clover tell you about?</Headline>
      <Lede>Notifications appear inside Clover. Email is optional and off unless you turn it on.</Lede>
      <div className="mt-8 divide-y divide-border-subtle rounded-sm border border-border-subtle bg-surface-raised px-4">
        <SettingRow label="New offers" description="A buyer made an offer, with Clover's take on it." control={<Switch checked={draft.notifyOffers} onCheckedChange={(v) => set("notifyOffers", v)} aria-label="Notify about new offers" />} />
        <SettingRow label="Stale listings" description="Something has gone quiet and might need a new price or photos." control={<Switch checked={draft.notifyStale} onCheckedChange={(v) => set("notifyStale", v)} aria-label="Notify about stale listings" />} />
        <SettingRow label="Publishing" description="A listing went live, needs a step from you, or failed." control={<Switch checked={draft.notifyPublishing} onCheckedChange={(v) => set("notifyPublishing", v)} aria-label="Notify about publishing" />} />
        <SettingRow label="Also send by email" description="A daily digest of the above." control={<Switch checked={draft.notifyEmail} onCheckedChange={(v) => set("notifyEmail", v)} aria-label="Also send notifications by email" />} />
      </div>
    </div>
  );
}

// ───────────────────────────── 7. Scan first item ─────────────────────────────
export function StepFirstItem({ onFinish, finishing }: { onFinish: () => void; finishing: boolean }) {
  return (
    <div className="text-center sm:text-left">
      <Headline>
        You&apos;re set. <br />
        Your first listing is a photo away.
      </Headline>
      <Lede>Point the camera at something you&apos;d sell. Clover identifies it, grades the condition, prices it from real comparables and writes the listing while you watch.</Lede>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button size="lg" onClick={onFinish} loading={finishing} leadingIcon={<Camera className="size-5" aria-hidden />}>
          Scan your first item
        </Button>
        <span className="text-xs text-muted">No camera handy? You can upload photos on the next screen.</span>
      </div>
    </div>
  );
}

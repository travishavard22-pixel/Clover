import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/layout/page-header";
import { ConfidenceBadge, AiBadge, Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/card";
import { primaryNav, secondaryNav } from "@/components/shell/nav-config";
import { MARKETPLACES, PRIMARY_MARKETPLACES } from "@/lib/marketplaces/registry";

export const metadata: Metadata = { title: "Help" };

function Keys({ combo }: { combo: string }) {
  const parts = combo.split(" ");
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-xs text-muted">then</span>}
          <Kbd>{p}</Kbd>
        </span>
      ))}
    </span>
  );
}

const GLOBAL_SHORTCUTS = [
  { keys: "n", action: "Sell something new (opens the camera)" },
  { keys: "⌘K", action: "Command palette — jump anywhere, find an item by name or SKU", alt: "Ctrl K on Windows and Linux" },
  { keys: "?", action: "This page" },
];

const SECTIONS = [
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "confidence", label: "Confidence tiers" },
  { id: "pricing", label: "How pricing works" },
  { id: "assisted", label: "Assisted publishing" },
  { id: "privacy", label: "Privacy" },
];

export default function HelpPage() {
  const nav = [...primaryNav, ...secondaryNav].filter((n) => n.shortcut && n.shortcut.startsWith("g "));
  return (
    <Page width="narrow">
      <PageHeader eyebrow="Help" title="How Clover works" description="Shortcuts, what the labels mean, where prices come from, and what happens to your data." />
      <nav aria-label="On this page" className="mb-8 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border-subtle bg-surface-raised px-3 py-1.5 text-sm text-secondary hover:text-primary">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        <section id="shortcuts" aria-labelledby="shortcuts-title" className="scroll-mt-20">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-primary">
            Keyboard shortcuts
          </h2>
          <p className="mt-1 text-sm text-secondary">Desktop is keyboard-first. Shortcuts are off while you type in a field. Keyboard navigation never animates.</p>
          <div className="surface-card mt-4 overflow-hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">Keyboard shortcuts</caption>
              <thead className="bg-surface-sunken text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Keys
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {GLOBAL_SHORTCUTS.map((s) => (
                  <tr key={s.keys}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Keys combo={s.keys} />
                    </td>
                    <td className="px-4 py-2.5 text-primary">
                      {s.action}
                      {s.alt && <span className="block text-xs text-muted">{s.alt}</span>}
                    </td>
                  </tr>
                ))}
                {nav.map((n) => (
                  <tr key={n.href}>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Keys combo={n.shortcut!} />
                    </td>
                    <td className="px-4 py-2.5 text-primary">Go to {n.label}</td>
                  </tr>
                ))}
                <tr>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Kbd>Enter</Kbd> / <Kbd>Esc</Kbd>
                  </td>
                  <td className="px-4 py-2.5 text-primary">Save / cancel an inline edit. In the copilot, Enter sends and Shift+Enter adds a line.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="confidence" aria-labelledby="confidence-title" className="scroll-mt-20">
          <h2 id="confidence-title" className="text-lg font-semibold text-primary">
            How confidence tiers work
          </h2>
          <p className="mt-1 text-sm text-secondary">Every field Clover fills from your photos carries a tier. It is per field, not per item: the brand can be Confident while the model number Needs check.</p>
          <ul className="mt-4 space-y-3">
            <li className="surface-card flex items-start gap-3 p-4">
              <ConfidenceBadge tier="CONFIDENT" className="mt-0.5 shrink-0" />
              <p className="text-sm text-primary">
                The evidence is clear — a legible label, a distinctive shape, matching text in more than one photo. <span className="text-secondary">Publish without a second look.</span>
              </p>
            </li>
            <li className="surface-card flex items-start gap-3 p-4">
              <ConfidenceBadge tier="LIKELY" className="mt-0.5 shrink-0" />
              <p className="text-sm text-primary">
                Probably right, from partial evidence. <span className="text-secondary">Glance at it; correcting takes one tap and Clover learns the fix for the rest of the listing.</span>
              </p>
            </li>
            <li className="surface-card flex items-start gap-3 p-4">
              <ConfidenceBadge tier="NEEDS_CHECK" className="mt-0.5 shrink-0" />
              <p className="text-sm text-primary">
                A guess, or nothing visible. <span className="text-secondary">Clover says so instead of inventing an answer and tells you which photo would settle it. Fields it could not fill say “Add this” rather than staying blank.</span>
              </p>
            </li>
          </ul>
          <p className="mt-3 text-sm text-secondary">
            Tap any field to see the photo crop or comparable that produced it. Numeric confidence (e.g. 0.91) is hidden by default; turn on <strong>Expert mode</strong> in Settings → Selling to see it.
          </p>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20">
          <h2 id="pricing-title" className="text-lg font-semibold text-primary">
            How pricing works
          </h2>
          <p className="mt-1 text-sm text-secondary">Prices are computed, never generated. The language model identifies and grades the item; the price comes from statistics over real sales.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="surface-card p-4">
              <Badge tone="success">Market evidence</Badge>
              <p className="mt-2 text-sm text-primary">Sold comparables were found for this item and condition. The band (low / likely / high) and the quick-sale, recommended and maximum prices are calculated from them, weighted by similarity and recency. You can open every comp and exclude any that don&apos;t match.</p>
            </div>
            <div className="surface-card p-4">
              <AiBadge />
              <p className="mt-2 text-sm text-primary">No usable comparables. The band is the model&apos;s estimate from the item&apos;s category and condition, shown with lower confidence and this label. Treat it as a starting point, not a market price. It is never presented as market data.</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-secondary">
            Every marketplace shows <strong>take-home</strong> after its fees, so the highest sticker price is not always the best net. Your pricing strategy (Quick sale / Balanced / Maximum value) only chooses where in the band a new listing starts; your floor price is never crossed by any automation.
          </p>
        </section>

        <section id="assisted" aria-labelledby="assisted-title" className="scroll-mt-20">
          <h2 id="assisted-title" className="text-lg font-semibold text-primary">
            How assisted publishing works
          </h2>
          <p className="mt-1 text-sm text-secondary">Clover uses a marketplace&apos;s official API when one exists. Where there is none, it never scrapes, never automates the site and never asks for your marketplace password. Instead it gets you 95% of the way there:</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-primary">
            <li>The listing is written to that marketplace&apos;s limits — title length, photo count, category names, condition wording.</li>
            <li>You copy the title, description and price with one tap each, and download the photo pack sized for that site.</li>
            <li>Clover opens the marketplace&apos;s “create listing” page in a new tab.</li>
            <li>When you paste the listing&apos;s link back, Clover tracks it like any other publication — offers, sold-sync, stale checks.</li>
          </ol>
          <div className="surface-card mt-4 divide-y divide-border-subtle">
            {PRIMARY_MARKETPLACES.map((m) => {
              const info = MARKETPLACES[m];
              return (
                <div key={m} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex w-40 shrink-0 items-center gap-2">
                    <span className="text-sm font-medium text-primary">{info.name}</span>
                    <Badge tone={info.mode === "api" ? "info" : "neutral"}>{info.mode === "api" ? "API" : info.mode === "api_or_assisted" ? "Assisted*" : "Assisted"}</Badge>
                  </div>
                  <p className="text-sm text-secondary">{info.modeExplanation}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">* Nextdoor switches to API publishing automatically once this installation has approved Publish API credentials.</p>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-20">
          <h2 id="privacy-title" className="text-lg font-semibold text-primary">
            Privacy summary
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-primary">
            <li>
              <strong>Your photos and records are yours.</strong> Originals are never overwritten; AI-generated studio images are labelled and keep a provenance record.
            </li>
            <li>
              <strong>Marketplace tokens</strong> are encrypted at rest (AES-256-GCM) with rotating keys, hold the fewest scopes that work, and are revoked when you disconnect or delete your account.
            </li>
            <li>
              <strong>Photos sent to the AI provider</strong> are used only to answer your request. In demo mode nothing leaves this server.
            </li>
            <li>
              <strong>Export</strong> gives you everything as JSON plus your photos in one ZIP, with a link that lasts 24 hours. <strong>Delete</strong> removes the account and every stored file; the only trace is an audit line with a hashed email.
            </li>
            <li>
              <strong>Audit log.</strong> Sign-ins, connections, publications, exports and deletions are recorded so you can see what happened and when.
            </li>
          </ul>
          <p className="mt-4 text-sm text-secondary">
            Both actions live in{" "}
            <Link href="/settings?tab=privacy" className="text-accent-text underline-offset-4 hover:underline">
              Settings → Privacy &amp; data
            </Link>
            .
          </p>
        </section>
      </div>
    </Page>
  );
}

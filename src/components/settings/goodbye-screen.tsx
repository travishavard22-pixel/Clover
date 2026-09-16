"use client";
import { ExternalLink } from "lucide-react";
import type { ListingToEnd } from "@/lib/jobs/handlers/delete-account";
import { CloverWordmark } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button-classes";

/** Shown after the account is gone. Plain anchors only: the app's routes would just redirect to sign-in. */
export function GoodbyeScreen({ listings }: { listings: ListingToEnd[] }) {
  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-surface-base" role="dialog" aria-modal="true" aria-labelledby="goodbye-title">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gutter py-10">
        <CloverWordmark size={22} />
        <h1 id="goodbye-title" className="serif-display mt-10 text-4xl text-primary sm:text-5xl">
          Your account is gone.
        </h1>
        <p className="mt-4 text-base text-secondary">Everything Clover stored about you has been deleted. The only trace is an audit line with a hashed email, kept so we can prove the deletion happened.</p>
        {listings.length > 0 ? (
          <div className="mt-8 rounded-sm border border-warning/40 bg-warning-soft p-4">
            <h2 className="text-sm font-semibold text-primary">
              {listings.length} listing{listings.length === 1 ? " is" : "s are"} still live on marketplaces
            </h2>
            <p className="mt-1 text-sm text-secondary">Clover could not end these for you. Open each one and end it so nobody buys something you no longer track.</p>
            <ul className="mt-3 space-y-2">
              {listings.map((l, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-primary">{l.itemTitle}</span>
                    <span className="text-xs text-muted">
                      {l.marketplaceName} · {l.mode === "API" ? "published via API" : "posted by you"}
                    </span>
                  </span>
                  {l.externalUrl && (
                    <a href={l.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-accent-text underline-offset-4 hover:underline">
                      Open <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-6 text-sm text-secondary">You had no live listings, so there is nothing left to end on any marketplace.</p>
        )}
        <div className="mt-10">
          <a href="/welcome" className={buttonClasses("outline")}>
            Back to the start
          </a>
        </div>
        <p className="mt-6 text-xs text-muted">Thanks for selling with Clover.</p>
      </div>
    </div>
  );
}

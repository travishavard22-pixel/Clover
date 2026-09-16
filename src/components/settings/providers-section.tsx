import { Check, Minus } from "lucide-react";
import type { Capabilities } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Rows, Section } from "./section";

type Row = { key: keyof Capabilities; name: string; enabled: string; fallback: string; env: string[] };

/** Env var names are shown so an operator knows what to set; values never leave the server. */
const ROWS: Row[] = [
  { key: "ai", name: "Identification, listing copy and copilot", enabled: "Anthropic Claude reads photos, writes listings and answers in the copilot.", fallback: "Demo provider: deterministic answers from a small catalogue, clearly labelled.", env: ["ANTHROPIC_API_KEY"] },
  { key: "ebay", name: "eBay publishing and comps", enabled: "Official eBay Sell APIs publish, update and end listings and read sold comparables.", fallback: "Demo sandbox: simulated listings and comps marked as not market evidence.", env: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_RU_NAME"] },
  { key: "nextdoorApi", name: "Nextdoor publishing", enabled: "Nextdoor Publish API creates For Sale & Free posts.", fallback: "Assisted publishing: Clover prepares the post, you paste it.", env: ["NEXTDOOR_CLIENT_ID", "NEXTDOOR_CLIENT_SECRET"] },
  { key: "segmentation", name: "Studio backgrounds", enabled: "A segmentation provider cuts the item out so a new background can be drawn around it.", fallback: "Enhancement only: exposure and colour, no background replacement.", env: ["STUDIO_SEGMENTATION_PROVIDER", "PHOTOROOM_API_KEY or REMOVEBG_API_KEY or RUNPOD_API_KEY + RUNPOD_SEGMENT_ENDPOINT_ID"] },
  { key: "barcode", name: "Barcode lookup", enabled: "UPCitemdb resolves scanned barcodes to products.", fallback: "Barcodes are read but not looked up.", env: ["UPCITEMDB_USER_KEY"] },
  { key: "s3", name: "Object storage", enabled: "Photos and exports live in S3-compatible storage.", fallback: "Local disk under STORAGE_LOCAL_DIR, served through signed URLs.", env: ["STORAGE_DRIVER=s3", "S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] },
];

export function ProvidersSection({ capabilities }: { capabilities: Capabilities }) {
  return (
    <Section id="providers" title="Providers and capabilities" description="What this Clover installation can do right now, and which environment variable turns each part on. Keys themselves are never shown.">
      {capabilities.demoMode && (
        <p className="mb-3 rounded-sm bg-warning-soft px-3 py-2 text-sm text-warning">
          <span className="font-medium">Demo mode is on</span> (CLOVER_DEMO_MODE=1). Every provider below runs its demo implementation regardless of keys.
        </p>
      )}
      <Rows>
        {ROWS.map((r) => {
          const on = capabilities[r.key];
          return (
            <div key={r.key} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-primary">{r.name}</span>
                  <Badge tone={on ? "success" : "neutral"}>
                    {on ? <Check className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                    {on ? "Live" : "Demo / fallback"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-secondary">{on ? r.enabled : r.fallback}</p>
              </div>
              <div className="sm:max-w-xs sm:text-right">
                <div className="text-xs text-muted">{on ? "Enabled by" : "Enable with"}</div>
                <div className="mt-0.5 flex flex-wrap gap-1 sm:justify-end">
                  {r.env.map((e) => (
                    <code key={e} className="rounded-[4px] bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-secondary">
                      {e}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </Rows>
    </Section>
  );
}

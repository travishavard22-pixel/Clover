"use client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { PhotoDTO } from "@/lib/items/dto";
import type { ProvenanceSummary } from "@/lib/studio/provenance";
import { CompareSlider } from "./compare-slider";
import { ProvenanceBadge } from "./provenance-badge";

/** Full-size view of a saved render beside its source, with the provenance record in plain words. */
export function RenderViewer({ render, source, provenance, open, onClose }: { render: PhotoDTO | null; source: PhotoDTO | null; provenance: ProvenanceSummary | null; open: boolean; onClose: () => void }) {
  if (!render) return null;
  const title = render.label ?? provenance?.modeName ?? "Studio photo";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={provenance ? `${provenance.label} · ${provenance.modeName}` : undefined} size="xl">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-studio">
          {source ? (
            <CompareSlider before={{ src: source.url, alt: "Original photo" }} after={{ src: render.url, alt: `${title} — ${provenance?.label ?? "studio photo"}` }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL
            <img src={render.url} alt={title} className="size-full object-contain" />
          )}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Label</dt>
            <dd className="mt-1">{provenance ? <ProvenanceBadge path={provenance.path} label={provenance.label} /> : render.aiGenerated ? "AI background" : "Not AI-generated"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Item pixels</dt>
            <dd className="mt-1 text-primary">{provenance?.itemPixels === "preserved" ? "Preserved exactly" : provenance?.itemPixels === "scaled" ? "Preserved, uniformly scaled to fit" : provenance?.itemPixels === "resampled" ? "Resampled (2× crop)" : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Size</dt>
            <dd className="mt-1 tabular text-primary">
              {render.width}×{render.height}
              {provenance?.hasPng ? " · PNG also saved" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Check</dt>
            <dd className="mt-1 text-primary">{provenance?.qa ? `${provenance.qa.status === "pass" ? "Passed" : provenance.qa.status === "skipped" ? "Not needed" : "Not run"} — ${provenance.qa.reason}` : "—"}</dd>
          </div>
          {provenance && (provenance.colourBalanced || provenance.mirrored || provenance.backgroundNote || provenance.notes.length > 0) && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">Notes</dt>
              <dd className="mt-1 text-secondary">
                {[provenance.mirrored ? "Mirrored horizontally." : null, provenance.colourBalanced ? "Global colour balance applied at your request." : null, provenance.backgroundNote, ...provenance.notes].filter(Boolean).join(" ")}
              </dd>
            </div>
          )}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

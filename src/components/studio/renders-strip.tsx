"use client";
import { Eye, ImagePlus, MoreHorizontal, RotateCcw, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import type { PhotoDTO } from "@/lib/items/dto";
import type { ProvenanceSummary } from "@/lib/studio/provenance";
import { cn } from "@/lib/utils/cn";
import { ProvenanceBadge } from "./provenance-badge";

export type RenderAction = "view" | "cover" | "use-original" | "delete";

/**
 * Saved studio and condition photos for the item, each with its honesty badge and actions. Nothing
 * here touches the originals: "Use original" puts the real photo back in the render's slot.
 */
export function RendersStrip({
  renders,
  provenance,
  selectedId,
  coverId,
  busyId,
  onAction,
  className,
}: {
  renders: PhotoDTO[];
  provenance: Record<string, ProvenanceSummary>;
  selectedId: string | null;
  coverId: string | null;
  busyId: string | null;
  onAction: (action: RenderAction, photo: PhotoDTO) => void;
  className?: string;
}) {
  return (
    <section aria-labelledby="studio-renders-title" className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <h2 id="studio-renders-title" className="text-sm font-semibold text-primary">
          Studio photos
        </h2>
        <span className="text-xs text-muted">{renders.length === 0 ? "None yet" : renders.length === 1 ? "1 saved" : `${renders.length} saved`}</span>
      </div>
      {renders.length === 0 ? (
        <EmptyState serif={false} title="No studio photos yet" description="Pick a mode, adjust if you like, then Generate. Originals are always kept." icon={<ImagePlus className="size-6" aria-hidden />} className="py-8" />
      ) : (
        <ul className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-4">
          {renders.map((p) => {
            const prov = provenance[p.id];
            const selected = p.id === selectedId;
            const busy = p.id === busyId;
            return (
              <li key={p.id} className={cn("w-44 shrink-0 overflow-hidden rounded-sm border bg-surface-raised sm:w-auto", selected ? "border-accent" : "border-border-subtle", busy && "opacity-60")} aria-busy={busy || undefined}>
                <button type="button" onClick={() => onAction("view", p)} className="relative block aspect-[4/3] w-full overflow-hidden bg-studio" aria-label={`View ${p.label ?? "studio photo"}`} aria-pressed={selected}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed same-origin file URL */}
                  <img src={p.thumbUrl} alt={`${p.label ?? "Studio photo"}${prov ? ` — ${prov.label}` : ""}`} className="size-full object-cover" />
                  {p.id === coverId && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-scrim px-1.5 py-0.5 text-[10px] font-medium text-white">
                      <Star className="size-3" aria-hidden /> Cover
                    </span>
                  )}
                </button>
                <div className="flex items-start justify-between gap-1 p-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-primary">{p.label ?? prov?.modeName ?? "Studio photo"}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {prov ? <ProvenanceBadge path={prov.path} label={prov.label} showSettingsLink={false} /> : p.aiGenerated ? <ProvenanceBadge path="composite" label="AI background" /> : null}
                      {prov?.qa && prov.qa.status !== "skipped" && (
                        <span className={cn("text-[11px]", prov.qa.status === "pass" ? "text-success" : "text-warning")} title={prov.qa.reason}>
                          {prov.qa.status === "pass" ? "Checked" : "Unchecked"}
                        </span>
                      )}
                    </div>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.label ?? "studio photo"}`} disabled={busy}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => onAction("view", p)}>
                        <Eye className="size-4" aria-hidden /> View
                      </MenuItem>
                      <MenuItem onSelect={() => onAction("cover", p)} disabled={p.id === coverId}>
                        <Star className="size-4" aria-hidden /> Set as cover
                      </MenuItem>
                      <MenuItem onSelect={() => onAction("use-original", p)}>
                        <RotateCcw className="size-4" aria-hidden /> Use original
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem destructive onSelect={() => onAction("delete", p)}>
                        <Trash2 className="size-4" aria-hidden /> Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

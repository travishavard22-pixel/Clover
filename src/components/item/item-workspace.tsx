"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageViewer } from "@/components/photos/image-viewer";
import { PhotoGallery } from "@/components/photos/photo-gallery";
import { Card, CardHeader } from "@/components/ui/card";
import type { ConditionGrade } from "@/lib/db";
import type { PhotoDTO } from "@/lib/items/dto";
import type { ItemSummary } from "@/lib/items/summary";
import type { ListingDraftDTO } from "@/lib/listings/store";
import { ConditionCard } from "./condition-card";
import { IdentificationCard } from "./identification-card";
import { errorMessage, itemApi, type PricingSlice, type ProfileSlice } from "./item-api";
import { ItemHeader } from "./item-header";
import { ListingCard } from "./listing-card";
import { PricingCard } from "./pricing-card";
import { StickyCta } from "./sticky-cta";
import { useAnnouncer } from "./use-announcer";

/**
 * The review workspace. Holds the summary as state; each card reports changes back through typed
 * slices so the whole page stays consistent (a corrected brand re-prices; a new price changes the CTA).
 */
export function ItemWorkspace({ initial }: { initial: ItemSummary }) {
  const [summary, setSummary] = useState(initial);
  const [viewer, setViewer] = useState<{ open: boolean; index: number; caption: string | null }>({ open: false, index: 0, caption: null });
  const { message, announce } = useAnnouncer();
  const router = useRouter();
  const id = summary.item.id;

  async function refresh() {
    try {
      setSummary(await itemApi.summary(id));
      router.refresh();
    } catch (err) {
      toast.error("Couldn't refresh", { description: errorMessage(err), action: { label: "Retry", onClick: () => void refresh() } });
    }
  }

  const applyPricing = (s: PricingSlice) => setSummary((cur) => ({ ...cur, estimate: s.estimate, comps: s.comps }));
  const applyProfile = (s: ProfileSlice) => setSummary((cur) => ({ ...cur, item: s.item, profile: s.profile, estimate: s.estimate, comps: s.comps }));

  const onTitle = async (title: string) => {
    if (!title) throw new Error("Title is required");
    const item = await itemApi.update(id, { title });
    setSummary((cur) => ({ ...cur, item: { ...cur.item, title: item.title, updatedAt: item.updatedAt } }));
    announce("Title saved");
  };

  const onEdit = async (field: string, value: string) => {
    applyProfile(await itemApi.editProfile(id, field, value));
    announce(value ? `${labelFor(field)} saved` : `${labelFor(field)} cleared`);
  };

  const onPickAlternative = async (index: number) => {
    const s = await itemApi.pickAlternative(id, index);
    applyProfile(s);
    announce(`Identified as ${s.profile?.data.itemName.value ?? "the selected item"}`);
    toast("Identification confirmed", { description: "The price was recalculated. Regenerate the listing to update the copy." });
  };

  const onGrade = async (grade: ConditionGrade) => {
    const item = await itemApi.update(id, { conditionGrade: grade });
    setSummary((cur) => ({ ...cur, item: { ...cur.item, conditionGrade: item.conditionGrade } }));
    if (summary.estimate) applyPricing(await itemApi.recalculate(id));
    announce("Condition grade saved and price recalculated");
  };

  const onListPrice = async (cents: number) => {
    const item = await itemApi.update(id, { listPrice: cents });
    setSummary((cur) => ({ ...cur, item: { ...cur.item, listPrice: item.listPrice } }));
    announce(`List price set to $${(cents / 100).toFixed(2)}`);
  };

  const onRecalculate = async () => {
    applyPricing(await itemApi.recalculate(id));
    announce("Price recalculated");
  };

  const onToggleComp = async (compId: string, included: boolean) => {
    applyPricing(await itemApi.setCompIncluded(id, compId, included));
    announce(included ? "Comparable included; price recalculated" : "Comparable excluded; price recalculated");
  };

  const onDraft = (d: ListingDraftDTO) => setSummary((cur) => ({ ...cur, drafts: cur.drafts.some((x) => x.key === d.key) ? cur.drafts.map((x) => (x.key === d.key ? d : x)) : [...cur.drafts, d] }));

  const onRegenerate = async () => {
    const out = await itemApi.regenerate(id);
    setSummary((cur) => ({ ...cur, drafts: out.drafts }));
    announce(`Listing regenerated: ${out.drafts.length} drafts`);
  };

  const onPhotos = (photos: PhotoDTO[]) => setSummary((cur) => ({ ...cur, photos }));

  const openEvidence = (index: number, caption: string) => setViewer({ open: true, index, caption });

  return (
    <div className="mx-auto w-full max-w-[1440px] gutter pb-28 lg:pb-12">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <ItemHeader summary={summary} onTitle={onTitle} onRefresh={refresh} announce={announce} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section id="photos" aria-labelledby="photos-heading" className="scroll-mt-24">
            <Card>
              <CardHeader title={<span id="photos-heading">Photos</span>} description={`${summary.photos.filter((p) => p.sortOrder < 1000).length} photos. The first is the cover. Drag to reorder; open one to zoom.`} />
              <div className="px-5 pb-5 pt-4">
                <PhotoGallery photos={summary.photos} itemId={id} editable onChange={onPhotos} />
              </div>
            </Card>
          </section>
          <IdentificationCard summary={summary} onEdit={onEdit} onPickAlternative={onPickAlternative} onEvidence={openEvidence} />
          <ConditionCard summary={summary} onGrade={onGrade} onEvidence={openEvidence} />
          <PricingCard summary={summary} onListPrice={onListPrice} onRecalculate={onRecalculate} onToggleComp={onToggleComp} />
          <ListingCard summary={summary} onDraft={onDraft} onRegenerate={onRegenerate} announce={announce} />
        </div>
        <div className="hidden lg:block">
          <StickyCta summary={summary} variant="rail" />
        </div>
      </div>
      <StickyCta summary={summary} variant="bar" />

      <ImageViewer photos={summary.photos} index={viewer.index} open={viewer.open} onClose={() => setViewer((v) => ({ ...v, open: false }))} onIndexChange={(index) => setViewer({ open: true, index, caption: null })} />
      {viewer.open && viewer.caption && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4" role="note" aria-live="polite">
          <p className="max-w-lg rounded-sm bg-surface-inverse/90 px-3 py-2 text-center text-sm text-inverse shadow-float">{viewer.caption}</p>
        </div>
      )}
    </div>
  );
}

function labelFor(field: string) {
  if (field.startsWith("attribute:")) return field.slice(10);
  const map: Record<string, string> = { itemName: "Item name", brand: "Brand", model: "Model", modelNumber: "Model number", color: "Color", material: "Material", size: "Size", dimensions: "Dimensions", approximateAge: "Age", categoryPath: "Category" };
  return map[field] ?? field;
}

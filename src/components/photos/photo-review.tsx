"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Camera } from "lucide-react";
import { toast } from "sonner";
import { startAnalysis } from "@/components/capture/upload-client";
import { Button, buttonClasses } from "@/components/ui/button";
import type { PhotoDTO } from "@/lib/items/dto";
import { visiblePhotos } from "@/lib/photos/order";
import { PhotoGallery } from "./photo-gallery";

/**
 * The review step between capture / upload and analysis: fix order, cover, rotation and crops,
 * then hand the item to the analysis job. All edits are saved as they happen, so leaving this page
 * never loses work — the draft stays on /sell.
 */
export function PhotoReview({ itemId, initialPhotos, itemTitle, sku }: { itemId: string; initialPhotos: PhotoDTO[]; itemTitle: string; sku: string }) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [starting, setStarting] = useState(false);
  const visible = visiblePhotos(photos);
  const hasLabelHints = visible.filter((p) => p.label).length;

  const continueToAnalysis = async () => {
    setStarting(true);
    try {
      const { jobId } = await startAnalysis(itemId);
      router.push(`/items/${itemId}/analyzing?job=${encodeURIComponent(jobId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The analysis could not be started");
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PhotoGallery photos={photos} itemId={itemId} editable onChange={setPhotos} />

      <section aria-labelledby="review-next" className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="review-next" className="text-base font-semibold text-primary">
            {visible.length === 0 ? "Add at least one photo" : visible.length < 3 ? "More angles help the identification" : "Ready to identify and price"}
          </h2>
          <p className="mt-0.5 text-sm text-secondary">
            {visible.length === 0
              ? "The analysis needs a photo to work from."
              : visible.length < 3
                ? `You have ${visible.length}. Front, back and the label give the best result — but ${visible.length} will do.`
                : `${visible.length} photos${hasLabelHints ? `, ${hasLabelHints} labelled` : ""}. Clover reads them in this order; the first is the cover.`}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            {itemTitle} · {sku}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/sell/capture?item=${encodeURIComponent(itemId)}`} className={buttonClasses("outline", "md")}>
            <Camera className="size-4" aria-hidden /> Take more
          </Link>
          <Button size="md" onClick={() => void continueToAnalysis()} loading={starting} disabled={visible.length === 0} trailingIcon={<ArrowRight className="size-4" />}>
            Continue → Analyze
          </Button>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { Camera, Upload } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

/** The one call to action on the dashboard. Calm, not a banner. */
export function SellCta({ firstTime }: { firstTime?: boolean }) {
  return (
    // Container query, not a viewport one: on the dashboard this sits in the narrow right-hand
    // column, where `md:flex-row` switched on from the window width and pushed the buttons out past
    // the card's edge. Side by side only once the card itself is wide enough to hold both.
    <section className="@container surface-card p-5" aria-labelledby="sell-heading">
      <div className="flex flex-col gap-4 @lg:flex-row @lg:items-center @lg:justify-between">
        <div>
          <h2 id="sell-heading" className="serif-display text-2xl text-primary md:text-3xl">
            {firstTime ? "What are you selling?" : "Photograph it. It's for sale."}
          </h2>
          <p className="mt-1 text-sm text-secondary">Clover identifies the item, estimates a price from comparable listings, writes the copy and prepares the photos. You approve everything.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href="/sell" className={buttonClasses("primary", "lg")}>
            <Camera className="size-5" aria-hidden /> Scan an item
          </Link>
          <Link href="/sell/upload" className={buttonClasses("outline", "lg")} aria-label="Upload photos">
            <Upload className="size-5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

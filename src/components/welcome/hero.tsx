import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";
import { PhotoFrames } from "./photo-frames";

export function Hero() {
  return (
    <section className="content-max relative isolate grid grid-cols-1 gap-12 gutter py-16 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-center md:py-28">
      <div aria-hidden className="hero-wash pointer-events-none absolute inset-0 -z-10" />
      <div className="max-w-xl">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted">AI resale assistant</p>
        <h1 className="serif-display text-[3.25rem] leading-[0.98] md:text-[5rem]">
          Photograph it.
          <br />
          It&rsquo;s for sale.
        </h1>
        <p className="mt-6 max-w-md text-lg text-secondary">
          Clover identifies what you&rsquo;re selling, prices it from real listings, writes the copy, cleans up the photos and publishes it on every marketplace you use.
          You approve everything.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/sign-up" className={buttonClasses("primary", "lg")}>
            <Camera className="size-5" aria-hidden /> Sell your first item
          </Link>
          <Link href="/sign-in" className={buttonClasses("ghost", "lg")}>
            Sign in <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <p className="mt-5 text-sm text-muted">Free to try. No marketplace passwords, ever.</p>
      </div>
      <PhotoFrames />
    </section>
  );
}

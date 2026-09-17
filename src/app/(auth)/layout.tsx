import Link from "next/link";
import { CloverWordmark } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside aria-label="About Clover" className="relative hidden overflow-hidden bg-surface-inverse text-inverse lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,oklch(0.32_0.08_152/0.6),transparent_55%)]" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <CloverWordmark size={26} className="text-inverse" />
          <div>
            <p className="serif-display text-6xl leading-[1.02]">
              Photograph it.
              <br />
              It&rsquo;s for sale.
            </p>
            <p className="mt-6 max-w-md text-base text-inverse/70">
              Clover identifies what you&rsquo;re selling, prices it from real listings, writes the copy, cleans up the photos and publishes it — on every marketplace you use.
            </p>
          </div>
          <p className="text-xs text-inverse/50">Estimates are labelled. Photos are never faked. You approve everything before it goes live.</p>
        </div>
      </aside>
      <div className="flex flex-col">
        <header className="flex h-(--topbar-h) items-center gutter lg:hidden">
          <Link href="/welcome" aria-label="Clover">
            <CloverWordmark size={22} />
          </Link>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center gutter py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}

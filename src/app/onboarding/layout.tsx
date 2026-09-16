import type { Metadata } from "next";
import Link from "next/link";
import { CloverWordmark } from "@/components/brand/logo";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Set up Clover" };

/** Nav-less shell for onboarding: the wordmark, the flow, nothing else to click. */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <header className="flex h-(--topbar-h) items-center justify-between gutter">
        <Link href="/onboarding" className="rounded-xs" aria-label="Clover">
          <CloverWordmark size={22} />
        </Link>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}

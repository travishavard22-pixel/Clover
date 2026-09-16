import type { Metadata } from "next";
import { WelcomeHeader } from "@/components/welcome/header";
import { Hero } from "@/components/welcome/hero";
import { HowItWorks } from "@/components/welcome/how-it-works";
import { Honesty } from "@/components/welcome/honesty";
import { Marketplaces } from "@/components/welcome/marketplaces";
import { Closing } from "@/components/welcome/closing";

export const metadata: Metadata = {
  title: "Clover — Photograph it. It's for sale.",
  description: "Clover identifies what you're selling, prices it from real listings, writes the copy, cleans up the photos and publishes it on every marketplace you use.",
};

export default function WelcomePage() {
  return (
    <div className="min-h-dvh bg-surface-base text-primary">
      <WelcomeHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Honesty />
        <Marketplaces />
        <Closing />
      </main>
      <footer className="border-t border-border-subtle">
        <div className="content-max flex flex-col gap-3 gutter py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} Clover. Estimates are labelled. Photos are never faked.</span>
          <span className="flex gap-5">
            <a className="hover:text-primary" href="/help">Help</a>
            <a className="hover:text-primary" href="/sign-in">Sign in</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

import { Camera, CheckCircle2, Store } from "lucide-react";
import { Reveal } from "./reveal";

const steps = [
  { icon: Camera, title: "Scan", body: "Take two to four photos. Clover reads the brand, model and condition, and shows exactly which photo each fact came from." },
  { icon: CheckCircle2, title: "Approve", body: "A price with its evidence, a listing that only says what's true, and studio photos that never alter the item. Edit anything in a tap." },
  { icon: Store, title: "Sold everywhere", body: "Publish to eBay through its official API and post to Facebook, OfferUp and Nextdoor with a guided flow. Sell it once — Clover ends the rest." },
];

export function HowItWorks() {
  return (
    <section className="border-t border-border-subtle bg-surface-raised">
      <div className="content-max gutter py-16 md:py-24">
        <Reveal>
          <h2 className="serif-display text-4xl md:text-5xl">Three steps. About a minute.</h2>
        </Reveal>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08} as="li" className="surface-card h-full p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                    <s.icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-mono text-xs text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-secondary">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

import { MARKETPLACES, PRIMARY_MARKETPLACES } from "@/lib/marketplaces/registry";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "./reveal";

export function Marketplaces() {
  return (
    <section className="border-t border-border-subtle bg-surface-raised">
      <div className="content-max gutter py-16 md:py-24">
        <Reveal>
          <h2 className="serif-display text-4xl md:text-5xl">Every marketplace, honestly.</h2>
          <p className="mt-3 max-w-2xl text-secondary">Where a marketplace offers an official API, Clover publishes for you. Where it doesn&rsquo;t, Clover prepares everything and you post it in about a minute.</p>
        </Reveal>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PRIMARY_MARKETPLACES.map((m, i) => {
            const info = MARKETPLACES[m];
            const api = info.mode === "api";
            return (
              <Reveal key={m} delay={i * 0.06} as="li" className="surface-card flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-sm text-sm font-semibold text-white" style={{ background: info.color }} aria-hidden>
                      {info.shortName.slice(0, 1)}
                    </span>
                    <span className="font-semibold">{info.name}</span>
                  </div>
                  <div className="mt-4">
                    <Badge tone={api ? "success" : info.mode === "api_or_assisted" ? "info" : "neutral"}>{api ? "Official API" : info.mode === "api_or_assisted" ? "API (pending) · Guided" : "Guided posting"}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-secondary">{info.modeExplanation}</p>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

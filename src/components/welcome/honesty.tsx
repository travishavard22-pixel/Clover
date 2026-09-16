import { Reveal } from "./reveal";

const rules = [
  ["Estimates are labelled.", "Prices come from comparable listings when they exist. When they don't, Clover says it's an estimate and shows its confidence."],
  ["Photos are never faked.", "The studio changes the background, shadow and framing. The item's own pixels are preserved and AI backgrounds are marked."],
  ["Nothing is invented.", "Listings only state facts read from your photos. Unknowns are written as unknowns, and every defect is disclosed."],
  ["We never automate their sites.", "Marketplaces without an API get a guided flow with your copy and photos ready. No bots, no passwords, no scraping."],
];

export function Honesty() {
  return (
    <section className="content-max gutter py-16 md:py-24">
      <Reveal>
        <p className="serif-display max-w-3xl text-3xl leading-tight md:text-5xl">
          Selling fast shouldn&rsquo;t mean saying things that aren&rsquo;t true.
        </p>
      </Reveal>
      <dl className="mt-12 grid gap-x-10 gap-y-8 md:grid-cols-2">
        {rules.map(([t, b], i) => (
          <Reveal key={t} delay={i * 0.06} className="border-t border-border-default pt-4">
            <dt className="text-base font-semibold">{t}</dt>
            <dd className="mt-1.5 text-sm text-secondary">{b}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

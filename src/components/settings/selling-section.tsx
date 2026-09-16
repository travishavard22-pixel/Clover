"use client";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Marketplace, Theme } from "@/lib/db";
import { MARKETPLACES, PRIMARY_MARKETPLACES } from "@/lib/marketplaces/registry";
import { PRICING_STRATEGIES, PRICING_STRATEGY_COPY, type PreferencesDTO, type PreferencesPatch } from "@/lib/settings/schema";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/select";
import { SettingRow, Switch } from "@/components/ui/switch";
import { useTheme, type ThemeSetting } from "@/components/shell/theme";
import { cn } from "@/lib/utils/cn";
import { Rows, Section } from "./section";

const THEME_TO_SETTING: Record<Theme, ThemeSetting> = { SYSTEM: "system", LIGHT: "light", DARK: "dark" };
const SETTING_TO_THEME: Record<ThemeSetting, Theme> = { system: "SYSTEM", light: "LIGHT", dark: "DARK" };

export function SellingSection({ prefs, update }: { prefs: PreferencesDTO; update: (patch: PreferencesPatch, opts?: { successMessage?: string }) => Promise<boolean> }) {
  const theme = useTheme();
  const [note, setNote] = useState(prefs.defaultShippingNote ?? "");
  const [savingNote, setSavingNote] = useState(false);
  useEffect(() => setNote(prefs.defaultShippingNote ?? ""), [prefs.defaultShippingNote]);
  const noteDirty = note.trim() !== (prefs.defaultShippingNote ?? "");

  // Keep the live theme in step with the stored preference on first paint (localStorage may disagree).
  useEffect(() => {
    const wanted = THEME_TO_SETTING[prefs.theme];
    if (theme.setting !== wanted) theme.setSetting(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMarket = (m: Marketplace) => {
    const has = prefs.defaultMarketplaces.includes(m);
    void update({ defaultMarketplaces: (has ? prefs.defaultMarketplaces.filter((x) => x !== m) : [...prefs.defaultMarketplaces, m]) as PreferencesPatch["defaultMarketplaces"] });
  };

  return (
    <Section id="selling" title="Selling preferences" description="Defaults for new listings, how prices start, and how Clover looks and behaves for you.">
      <Rows>
        <fieldset className="py-4">
          <legend className="text-sm font-medium text-primary">Marketplaces prepared by default</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {PRIMARY_MARKETPLACES.map((m) => {
              const info = MARKETPLACES[m];
              const on = prefs.defaultMarketplaces.includes(m);
              return (
                <label key={m} className={cn("flex cursor-pointer items-center gap-3 rounded-sm border p-3 transition-colors", on ? "border-accent bg-accent-soft/40" : "border-border-subtle hover:border-border-default")}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleMarket(m)} />
                  <span className={cn("flex size-5 items-center justify-center rounded-[5px] border", on ? "border-accent bg-accent text-on-accent" : "border-border-strong")} aria-hidden>
                    {on && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-primary">{info.name}</span>
                    <span className="block text-xs text-secondary">{info.mode === "api" ? "Publishes through the API" : "Assisted — you post it"}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <SettingRow label="I ship items" description="Adds shipping options and a packing note to listings." control={<Switch checked={prefs.offersShipping} onCheckedChange={(v) => void update({ offersShipping: v })} aria-label="I ship items" />} />
        <SettingRow label="I offer local pickup" description="Local marketplaces list pickup by city." control={<Switch checked={prefs.offersLocalPickup} onCheckedChange={(v) => void update({ offersLocalPickup: v })} aria-label="I offer local pickup" />} />
        <form
          className="py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingNote(true);
            await update({ defaultShippingNote: note.trim() || null }, { successMessage: "Shipping note saved." });
            setSavingNote(false);
          }}
        >
          <Field label="Default shipping note" hint="Appended to listings on marketplaces that show shipping details." optional>
            {(p) => <Textarea {...p} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} className="min-h-20" />}
          </Field>
          <div className="mt-2 flex items-center gap-2">
            <Button type="submit" size="sm" variant={noteDirty ? "primary" : "outline"} disabled={!noteDirty} loading={savingNote}>
              Save note
            </Button>
            <span className="tabular text-xs text-muted">{note.length}/280</span>
          </div>
        </form>
        <div className="py-4">
          <div className="text-sm font-medium text-primary">Pricing strategy</div>
          <div className="mt-0.5 text-sm text-secondary">Where in the estimate band a new listing starts. The full band is always shown.</div>
          <div role="radiogroup" aria-label="Pricing strategy" className="mt-3 grid gap-2 md:grid-cols-3">
            {PRICING_STRATEGIES.map((s) => {
              const on = prefs.pricingStrategy === s;
              return (
                <button key={s} type="button" role="radio" aria-checked={on} onClick={() => void update({ pricingStrategy: s })} className={cn("rounded-sm border p-3 text-left transition-colors", on ? "border-accent bg-accent-soft/40" : "border-border-subtle hover:border-border-default")}>
                  <span className="block text-sm font-medium text-primary">{PRICING_STRATEGY_COPY[s].label}</span>
                  <span className="mt-0.5 block text-xs text-secondary">{PRICING_STRATEGY_COPY[s].description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Rows>

      <h3 className="mt-6 text-sm font-semibold text-primary">Appearance and behaviour</h3>
      <Rows className="mt-2">
        <SettingRow
          label="Theme"
          description="System follows your device."
          control={
            <Segmented<ThemeSetting>
              aria-label="Theme"
              size="sm"
              value={theme.setting}
              onChange={(v) => {
                theme.setSetting(v);
                void update({ theme: SETTING_TO_THEME[v] });
              }}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          }
        />
        <SettingRow
          label="Reduce motion"
          description="Fades instead of slides, no springs. Also follows your device's setting."
          control={
            <Switch
              checked={prefs.reducedMotion}
              onCheckedChange={(v) => {
                document.body.dataset.reducedMotion = v ? "true" : "false";
                void update({ reducedMotion: v });
              }}
              aria-label="Reduce motion"
            />
          }
        />
        <SettingRow label="Expert mode" description="Show numeric confidence next to the plain-language tier, plus method details on estimates." control={<Switch checked={prefs.expertMode} onCheckedChange={(v) => void update({ expertMode: v })} aria-label="Expert mode" />} />
      </Rows>
    </Section>
  );
}

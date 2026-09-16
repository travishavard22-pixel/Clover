"use client";
import { useId } from "react";
import { FlipHorizontal2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ModeSpec } from "@/lib/studio/modes";
import { ANGLE_NOTE, BACKGROUND_PRESETS, HEX_COLOUR, resolveBackgroundHex, type Aspect, type Lighting, type ShadowType, type StudioOptions } from "@/lib/studio/options";
import { cn } from "@/lib/utils/cn";
import { FocusPicker } from "./focus-picker";
import { LabelledSlider } from "./labelled-slider";

type Patch = (fn: (o: StudioOptions) => StudioOptions) => void;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left mb-2 w-full">
        <span className="text-sm font-semibold text-primary">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </legend>
      <div className="clear-both space-y-3">{children}</div>
    </fieldset>
  );
}

/**
 * Every control changes presentation only: background, light, framing, shadow, an explicit global
 * colour balance, and — for the crop modes — the focus point and caption. There is deliberately no
 * angle control (see ANGLE_NOTE).
 */
export function ControlsPanel({ spec, options, onPatch, onReset, source, className }: { spec: ModeSpec; options: StudioOptions; onPatch: Patch; onReset: () => void; source: { src: string; alt: string } | null; className?: string }) {
  const customId = useId();
  const isPreset = options.background === "auto" || BACKGROUND_PRESETS.some((p) => p.id === options.background);
  const customHex = isPreset ? resolveBackgroundHex(options.background, spec.autoBackgroundHex) : options.background;
  const composite = !spec.keepsBackground;
  const cbActive = options.colorBalance.temperature !== 0 || options.colorBalance.exposure !== 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-primary">Adjust</h2>
        <Button variant="ghost" size="sm" leadingIcon={<RotateCcw className="size-3.5" />} onClick={onReset}>
          Reset to {spec.name} defaults
        </Button>
      </div>

      {composite && (
        <Section title="Background" hint={spec.id === "SOCIAL" ? "Auto picks a bold complement of the item's own colour." : spec.id === "LIFESTYLE" ? "Auto uses the scene generator when one is configured, otherwise a softened version of the original." : undefined}>
          <div role="radiogroup" aria-label="Background preset" className="flex flex-wrap gap-2">
            <Swatch label="Auto" hex={spec.autoBackgroundHex} checked={options.background === "auto"} onSelect={() => onPatch((o) => ({ ...o, background: "auto" }))} auto />
            {BACKGROUND_PRESETS.map((p) => (
              <Swatch key={p.id} label={p.name} hex={p.hex} title={p.description} checked={options.background === p.id} onSelect={() => onPatch((o) => ({ ...o, background: p.id }))} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor={customId} className="text-sm text-secondary">
              Custom colour
            </label>
            <input
              id={customId}
              type="color"
              value={customHex}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                if (HEX_COLOUR.test(v)) onPatch((o) => ({ ...o, background: v }));
              }}
              className="h-8 w-12 cursor-pointer rounded-xs border border-border-default bg-surface-raised p-0.5"
              aria-describedby={`${customId}-value`}
            />
            <span id={`${customId}-value`} className="font-mono text-xs text-muted">
              {isPreset ? `${customHex} (preset)` : customHex}
            </span>
          </div>
        </Section>
      )}

      {composite && (
        <Section title="Light and shadow">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-primary">Lighting</span>
            <Segmented<Lighting> aria-label="Lighting" size="sm" value={options.lighting} onChange={(lighting) => onPatch((o) => ({ ...o, lighting }))} options={[{ value: "soft", label: "Soft" }, { value: "studio", label: "Studio" }, { value: "dramatic", label: "Dramatic" }]} />
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-primary">Shadow</span>
            <Segmented<ShadowType>
              aria-label="Shadow type"
              size="sm"
              value={options.shadow.type}
              onChange={(type) => onPatch((o) => ({ ...o, shadow: { ...o.shadow, type } }))}
              options={[{ value: "none", label: "None" }, { value: "contact", label: "Contact" }, { value: "soft", label: "Soft" }, { value: "drop", label: "Drop" }]}
            />
          </div>
          <LabelledSlider label="Shadow opacity" value={Math.round(options.shadow.opacity * 100)} min={0} max={100} disabled={options.shadow.type === "none"} onChange={(v) => onPatch((o) => ({ ...o, shadow: { ...o.shadow, opacity: v / 100 } }))} format={(v) => `${v}%`} />
          <LabelledSlider label="Shadow offset" value={options.shadow.offset} min={0} max={10} step={0.5} disabled={options.shadow.type === "none"} onChange={(v) => onPatch((o) => ({ ...o, shadow: { ...o.shadow, offset: v } }))} format={(v) => `${v}% of height`} />
        </Section>
      )}

      <Section title="Framing" hint={composite ? "Padding is space around the item as a share of the short edge." : "Detail and condition photos crop the original; the aspect shapes the crop."}>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-primary">Aspect</span>
          <Segmented<Aspect>
            aria-label="Aspect ratio"
            size="sm"
            value={options.crop.aspect}
            onChange={(aspect) => onPatch((o) => ({ ...o, crop: { ...o.crop, aspect } }))}
            options={[{ value: "original", label: "Original" }, { value: "1:1", label: "1:1" }, { value: "4:3", label: "4:3" }, { value: "3:4", label: "3:4" }, { value: "16:9", label: "16:9" }]}
          />
        </div>
        {composite && <LabelledSlider label="Padding" value={options.crop.padding} min={0} max={30} step={0.5} onChange={(v) => onPatch((o) => ({ ...o, crop: { ...o.crop, padding: v } }))} format={(v) => `${v}%`} />}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="studio-flip" className="flex items-center gap-2 text-sm font-medium text-primary">
              <FlipHorizontal2 className="size-4 text-muted" aria-hidden /> Flip horizontally
            </label>
            <p className="mt-0.5 text-xs text-muted">Mirrors the whole photo. Text and logos will read backwards.</p>
          </div>
          <Switch id="studio-flip" checked={options.flipHorizontal} onCheckedChange={(flipHorizontal) => onPatch((o) => ({ ...o, flipHorizontal }))} />
        </div>
        <p className="text-xs text-muted">{ANGLE_NOTE}</p>
      </Section>

      <Section title="Colour balance" hint="Off by default so colours stay true. When used, it applies to the whole photo — item included — and is recorded in the photo's provenance.">
        <LabelledSlider label="Temperature" value={options.colorBalance.temperature} min={-100} max={100} step={1} onChange={(v) => onPatch((o) => ({ ...o, colorBalance: { ...o.colorBalance, temperature: v } }))} format={(v) => (v === 0 ? "Neutral" : v > 0 ? `+${v} warm` : `${v} cool`)} />
        <LabelledSlider label="Exposure" value={options.colorBalance.exposure} min={-1} max={1} step={0.05} onChange={(v) => onPatch((o) => ({ ...o, colorBalance: { ...o.colorBalance, exposure: Math.round(v * 100) / 100 } }))} format={(v) => (v === 0 ? "0 EV" : `${v > 0 ? "+" : ""}${v.toFixed(2)} EV`)} />
        {cbActive && (
          <Button variant="outline" size="sm" onClick={() => onPatch((o) => ({ ...o, colorBalance: { temperature: 0, exposure: 0 } }))}>
            Turn colour balance off
          </Button>
        )}
      </Section>

      {spec.usesFocus && source && (
        <Section title={spec.id === "CONDITION" ? "Defect to show" : "Detail to show"} hint={spec.id === "CONDITION" ? "The ring is drawn around this point. Nothing is hidden or smoothed." : "The crop is centred here at 2× magnification."}>
          <FocusPicker src={source.src} alt={source.alt} value={options.focus} onChange={(focus) => onPatch((o) => ({ ...o, focus }))} mirrored={options.flipHorizontal} />
          {spec.id === "CONDITION" && (
            <Field label="Label" hint="Drawn on the photo, e.g. “Scratch on the lid”. Up to 60 characters." optional>
              {(p) => <Input {...p} value={options.label} maxLength={60} onChange={(e) => onPatch((o) => ({ ...o, label: e.target.value }))} placeholder="Describe the imperfection" />}
            </Field>
          )}
        </Section>
      )}
    </div>
  );
}

function Swatch({ label, hex, title, checked, onSelect, auto }: { label: string; hex: string; title?: string; checked: boolean; onSelect: () => void; auto?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={`${label}${title ? ` — ${title}` : ""}`}
      title={title}
      onClick={onSelect}
      className={cn("flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 text-xs font-medium transition-colors", checked ? "border-accent bg-accent-soft text-accent-text" : "border-border-subtle bg-surface-raised text-secondary hover:border-border-default")}
    >
      <span className={cn("size-6 rounded-full border border-border-default", auto && "bg-[conic-gradient(from_0deg,#F8F7F3,#2F6F8F,#EFE6D6,#2A2B29,#F8F7F3)]")} style={auto ? undefined : { background: hex }} aria-hidden />
      {label}
    </button>
  );
}

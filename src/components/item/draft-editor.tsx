"use client";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { ListingCopy } from "@/lib/ai/schemas";
import type { ListingDraftDTO } from "@/lib/listings/store";
import { cn } from "@/lib/utils/cn";

export function copyOf(d: ListingDraftDTO): ListingCopy {
  return { title: d.title, description: d.description, bullets: d.bullets, conditionText: d.conditionText, specifics: d.specifics, keywords: d.keywords, suggestedCategoryPath: d.categoryPath };
}

function sameCopy(a: ListingCopy, b: ListingCopy) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The editable body of one draft. Edits are local until "Save"; the parent persists them as a
 * version and remounts the editor (key = draft version) so the saved copy becomes the new base.
 * Title and description show live counts against the marketplace limit.
 */
export function DraftEditor({ draft, onSave, saving }: { draft: ListingDraftDTO; onSave: (copy: ListingCopy) => Promise<void>; saving: boolean }) {
  const base = useMemo(() => copyOf(draft), [draft]);
  const [copy, setCopy] = useState<ListingCopy>(base);
  const [newKeyword, setNewKeyword] = useState("");
  const dirty = !sameCopy(copy, base);
  const titleOver = copy.title.length > draft.limits.titleMax;
  const descOver = copy.description.length > draft.limits.descriptionMax;
  const id = `draft-${draft.key}`;

  const set = <K extends keyof ListingCopy>(k: K, v: ListingCopy[K]) => setCopy((c) => ({ ...c, [k]: v }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) void onSave({ ...copy, bullets: copy.bullets.filter((b) => b.trim()), keywords: copy.keywords.filter((k) => k.trim()), specifics: copy.specifics.filter((s) => s.name.trim() && s.value.trim()) });
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          if (dirty) (e.currentTarget as HTMLFormElement).requestSubmit();
        }
      }}
    >
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-title`} className="text-sm font-medium text-primary">
            Title
          </label>
          <span className={cn("tabular text-xs", titleOver ? "font-medium text-warning" : "text-muted")} aria-live="polite">
            {copy.title.length} / {draft.limits.titleMax}
            {titleOver && " — over the limit; it will be cut when published"}
          </span>
        </div>
        <Input id={`${id}-title`} value={copy.title} onChange={(e) => set("title", e.target.value)} className="mt-1" aria-invalid={titleOver} maxLength={400} />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${id}-desc`} className="text-sm font-medium text-primary">
            Description
          </label>
          <span className={cn("tabular text-xs", descOver ? "font-medium text-warning" : "text-muted")}>
            {copy.description.length.toLocaleString()} / {draft.limits.descriptionMax.toLocaleString()}
          </span>
        </div>
        <Textarea id={`${id}-desc`} value={copy.description} onChange={(e) => set("description", e.target.value)} className="mt-1 min-h-48 font-sans" aria-invalid={descOver} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-primary">Highlights</legend>
        <ul className="mt-1 space-y-1.5">
          {copy.bullets.map((b, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Input aria-label={`Highlight ${i + 1}`} value={b} onChange={(e) => set("bullets", copy.bullets.map((x, j) => (j === i ? e.target.value : x)))} className="h-9" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove highlight ${i + 1}`} onClick={() => set("bullets", copy.bullets.filter((_, j) => j !== i))}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className="mt-1.5" leadingIcon={<Plus className="size-4" aria-hidden />} onClick={() => set("bullets", [...copy.bullets, ""])} disabled={copy.bullets.length >= 12}>
          Add highlight
        </Button>
      </fieldset>

      <div>
        <label htmlFor={`${id}-cond`} className="text-sm font-medium text-primary">
          Condition
        </label>
        <Textarea id={`${id}-cond`} value={copy.conditionText} onChange={(e) => set("conditionText", e.target.value)} className="mt-1 min-h-20" />
      </div>

      {copy.specifics.length > 0 && (
        <fieldset>
          <legend className="text-sm font-medium text-primary">Item specifics</legend>
          <div className="mt-1 divide-y divide-border-subtle rounded-sm border border-border-subtle">
            {copy.specifics.map((s, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center gap-1.5 p-1.5">
                <Input aria-label={`Specific ${i + 1} name`} value={s.name} onChange={(e) => set("specifics", copy.specifics.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="h-8 text-sm" />
                <Input aria-label={`${s.name || `Specific ${i + 1}`} value`} value={s.value} onChange={(e) => set("specifics", copy.specifics.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className="h-8 text-sm" />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${s.name || `specific ${i + 1}`}`} onClick={() => set("specifics", copy.specifics.filter((_, j) => j !== i))}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-primary">Keywords</legend>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {copy.keywords.map((k, i) => (
            <li key={`${k}-${i}`} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-sunken pl-2.5 pr-1 text-xs text-primary">
              {k}
              <button type="button" aria-label={`Remove keyword ${k}`} onClick={() => set("keywords", copy.keywords.filter((_, j) => j !== i))} className="inline-flex size-5 items-center justify-center rounded-full hover:bg-border-subtle">
                <X className="size-3" />
              </button>
            </li>
          ))}
          <li>
            <Input
              aria-label="Add keyword"
              placeholder="Add keyword"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKeyword.trim()) {
                  e.preventDefault();
                  set("keywords", [...copy.keywords, newKeyword.trim()]);
                  setNewKeyword("");
                }
              }}
              className="h-7 w-36 text-xs"
              maxLength={60}
            />
          </li>
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <span className="text-xs text-muted">{dirty ? "Unsaved changes" : `Saved · v${draft.version} · ${draft.generatedBy === "user" ? "edited by you" : draft.generatedBy.startsWith("derived") ? "derived from the master draft" : `written by ${draft.generatedBy}`}`}</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => setCopy(base)}>
            Discard
          </Button>
          <Button type="submit" size="sm" disabled={!dirty} loading={saving}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

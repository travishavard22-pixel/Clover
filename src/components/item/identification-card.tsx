"use client";
import { useState } from "react";
import { Camera, Plus } from "lucide-react";
import { ConfidenceBadge, DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PROFILE_FIELD_KEYS, PROFILE_FIELD_LABELS, type ProfileFieldKey } from "@/lib/ai/profile-edit";
import type { ItemSummary } from "@/lib/items/summary";
import { cn } from "@/lib/utils/cn";
import { AlternativesChooser } from "./alternatives-chooser";
import { InlineEdit } from "./inline-edit";
import { ProfileFieldRow } from "./profile-field-row";

const PHOTO_NEEDS: Record<string, string> = {
  label_closeup: "Label close-up",
  serial_number: "Serial number",
  underside: "Underside",
  ports: "Ports",
  size_tag: "Size tag",
  inside: "Inside",
  back: "Back",
  defect_closeup: "Defect close-up",
  accessories: "Accessories",
  power_on_screen: "Powered-on screen",
};

/**
 * What Clover thinks the item is, field by field, with confidence and evidence. Every unknown is an
 * explicit "Add this" row so nothing is silently blank.
 */
export function IdentificationCard({
  summary,
  onEdit,
  onPickAlternative,
  onEvidence,
}: {
  summary: ItemSummary;
  onEdit: (field: string, value: string) => Promise<void>;
  onPickAlternative: (index: number) => Promise<void>;
  onEvidence: (photoIndex: number, caption: string) => void;
}) {
  const profile = summary.profile;
  const expert = summary.prefs.expertMode;
  const photoCount = summary.photos.filter((p) => p.sortOrder < 1000).length;
  const [adding, setAdding] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  if (!profile) {
    return (
      <Card>
        <CardHeader title="Identification" description="Nothing identified yet. Run analysis to read brand, model and specifics from the photos." />
      </Card>
    );
  }

  const p = profile.data;
  const verified = new Set(p.userVerified);
  const identityConfirmed = p.identityTier === "CONFIDENT";
  const showChooser = !identityConfirmed && p.alternativeIdentifications.length > 0;

  const submitAdd = async (name: string) => {
    if (!addValue.trim()) {
      setAddError("Enter a value");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      await onEdit(`attribute:${name}`, addValue.trim());
      setAdding(null);
      setAddValue("");
      setNewName("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setAddBusy(false);
    }
  };

  const addRow = (name: string, hint: string) => (
    <div key={name} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-x-3 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center" role="row">
      <dt className="text-sm text-secondary" role="rowheader">
        {name}
      </dt>
      <dd className="min-w-0 sm:col-span-2" role="cell">
        {adding === name ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAdd(name);
            }}
          >
            <Input autoFocus aria-label={`${name} value`} value={addValue} onChange={(e) => setAddValue(e.target.value)} placeholder={hint} className="h-9 max-w-xs" maxLength={200} aria-invalid={!!addError} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} />
            <Button type="submit" size="sm" loading={addBusy}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            {addError && (
              <span role="alert" className="text-xs text-danger">
                {addError}
              </span>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdding(name);
              setAddValue("");
              setAddError(null);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border-default px-2.5 text-xs text-secondary hover:border-accent hover:text-primary"
          >
            <Plus className="size-3" aria-hidden />
            Add this — not visible in the photos
          </button>
        )}
      </dd>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Identification"
        description={identityConfirmed ? (verified.has("itemName") ? "Identity confirmed by you." : "Identity is confident. Tap any value to correct it.") : "Check the highlighted values before publishing. Tap any value to correct it."}
        action={
          <div className="flex flex-col items-end gap-1">
            <ConfidenceBadge tier={p.identityTier} score={p.identityConfidence} expert={expert} />
            {profile.demo && <DemoBadge />}
          </div>
        }
      />
      <CardBody className="space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Item</div>
          <InlineEdit value={p.itemName.value} label="item name" onSave={(v) => onEdit("itemName", v)} displayClassName="serif-display text-2xl md:text-3xl text-primary -mx-1 px-1" inputClassName="serif-display text-xl h-11" maxLength={140} />
          {p.itemName.note && !verified.has("itemName") && <p className="mt-1 text-xs text-secondary">{p.itemName.note}</p>}
        </div>

        {showChooser && <AlternativesChooser profile={p} onPick={onPickAlternative} onConfirmCurrent={() => onEdit("itemName", p.itemName.value)} />}

        <dl className="divide-y divide-border-subtle" role="table" aria-label="Identified attributes">
          {PROFILE_FIELD_KEYS.filter((k): k is Exclude<ProfileFieldKey, "itemName"> => k !== "itemName").map((key) => (
            <ProfileFieldRow key={key} label={PROFILE_FIELD_LABELS[key]} field={p[key]} verified={verified.has(key)} expert={expert} photoCount={photoCount} onEvidence={onEvidence} onSave={(v) => onEdit(key, v)} />
          ))}
          <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center" role="row">
            <dt className="text-sm text-secondary" role="rowheader">
              Category
            </dt>
            <dd className="min-w-0 text-sm" role="cell">
              <InlineEdit value={p.categoryPath.join(" > ")} label="category" placeholder="Add category" onSave={(v) => onEdit("categoryPath", v)} displayClassName="-mx-1 px-1 py-0.5 font-medium" maxLength={300} renderDisplay={(v) => <span className="break-words">{v}</span>} />
            </dd>
            <dd className="col-start-2 sm:col-start-3" role="cell">
              {verified.has("categoryPath") ? <ConfidenceBadge tier="CONFIDENT" score={1} expert={expert} /> : <ConfidenceBadge tier={p.categoryConfidence >= 0.85 ? "CONFIDENT" : p.categoryConfidence >= 0.6 ? "LIKELY" : "NEEDS_CHECK"} score={p.categoryConfidence} expert={expert} />}
            </dd>
          </div>
          {p.attributes.map((a) => (
            <ProfileFieldRow key={a.name} label={a.name} field={a.field} verified={verified.has(`attribute:${a.name}`)} expert={expert} photoCount={photoCount} onEvidence={onEvidence} onSave={(v) => onEdit(`attribute:${a.name}`, v)} />
          ))}
          {p.unknowns.map((u) => addRow(u, "What a buyer should know"))}
          <div className="py-2.5" role="row">
            <dd className="sm:col-span-3" role="cell">
              {adding === "__new__" ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newName.trim()) {
                      setAddError("Enter a name");
                      return;
                    }
                    void submitAdd(newName.trim());
                  }}
                >
                  <Input autoFocus aria-label="Attribute name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Capacity" className="h-9 w-40" maxLength={80} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} />
                  <Input aria-label="Attribute value" value={addValue} onChange={(e) => setAddValue(e.target.value)} placeholder="e.g. 256 GB" className="h-9 w-48" maxLength={200} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} />
                  <Button type="submit" size="sm" loading={addBusy}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
                    Cancel
                  </Button>
                  {addError && (
                    <span role="alert" className="text-xs text-danger">
                      {addError}
                    </span>
                  )}
                </form>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<Plus className="size-4" aria-hidden />}
                  onClick={() => {
                    setAdding("__new__");
                    setAddValue("");
                    setNewName("");
                    setAddError(null);
                  }}
                >
                  Add another detail
                </Button>
              )}
            </dd>
          </div>
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="text-xs uppercase tracking-wide text-muted">Included in the photos</h4>
            {p.accessoriesIncluded.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {p.accessoriesIncluded.map((a) => (
                  <li key={a} className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-primary">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-secondary">Only the item itself is visible.</p>
            )}
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-wide text-muted">Not shown</h4>
            {p.possiblyMissing.length ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {p.possiblyMissing.map((a) => (
                  <li key={a} className="rounded-full border border-border-subtle px-2.5 py-0.5 text-xs text-secondary">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-secondary">Nothing standard appears to be missing.</p>
            )}
          </div>
        </div>

        {p.needsMorePhotos.length > 0 && (
          <div className={cn("rounded-sm border border-border-subtle bg-surface-sunken/60 p-3")}>
            <h4 className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <Camera className="size-4" aria-hidden />
              Photos that would raise confidence
            </h4>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {p.needsMorePhotos.map((n) => (
                <li key={n}>
                  <a href="#photos" className="inline-flex h-7 items-center rounded-full border border-border-default bg-surface-raised px-2.5 text-xs text-primary hover:border-accent">
                    {PHOTO_NEEDS[n] ?? n}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {p.notes && <p className="text-xs text-secondary">{p.notes}</p>}
      </CardBody>
    </Card>
  );
}

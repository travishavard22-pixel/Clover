"use client";
import { useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ListingCopy } from "@/lib/ai/schemas";
import type { ItemSummary } from "@/lib/items/summary";
import type { DraftKey, ListingDraftDTO } from "@/lib/listings/store";
import { LISTING_TOOLS, type ListingToolId } from "@/lib/listings/tool-catalog";
import type { ToolProposal } from "@/lib/listings/tools";
import { MARKETPLACES } from "@/lib/marketplaces/registry";
import { DraftEditor } from "./draft-editor";
import { errorMessage, itemApi } from "./item-api";
import { SelfCheckBadge } from "./self-check-badge";
import { ToolDiffDialog } from "./tool-diff-dialog";
import { VersionHistory } from "./version-history";

/**
 * One tab per draft: the master ("Generic") first, the seller's default marketplaces next, the rest
 * folded behind "More". Tools propose; the seller reviews a diff and applies or keeps.
 */
export function ListingCard({ summary, onDraft, onRegenerate, announce }: { summary: ItemSummary; onDraft: (d: ListingDraftDTO) => void; onRegenerate: () => Promise<void>; announce: (m: string) => void }) {
  const { drafts, item, prefs } = summary;
  const ordered = useMemo(() => {
    const rank = (d: ListingDraftDTO) => (d.key === "generic" ? 0 : prefs.defaultMarketplaces.includes(d.key) ? 1 : 2);
    return [...drafts].sort((a, b) => rank(a) - rank(b) || a.marketplaceName.localeCompare(b.marketplaceName));
  }, [drafts, prefs.defaultMarketplaces]);
  const primary = ordered.filter((d) => d.key === "generic" || prefs.defaultMarketplaces.includes(d.key));
  const others = ordered.filter((d) => !primary.includes(d));
  const [showOthers, setShowOthers] = useState(false);
  const [active, setActive] = useState<DraftKey>(ordered[0]?.key ?? "generic");
  const [saving, setSaving] = useState(false);
  const [toolBusy, setToolBusy] = useState<ListingToolId | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [proposal, setProposal] = useState<ToolProposal | null>(null);
  const current = ordered.find((d) => d.key === active) ?? ordered[0] ?? null;
  const visibleTabs = showOthers || (current && others.includes(current)) ? ordered : primary;

  const save = async (copy: ListingCopy) => {
    if (!current) return;
    setSaving(true);
    try {
      const d = await itemApi.saveDraft(item.id, current.key, copy);
      onDraft(d);
      announce(`${d.marketplaceName} draft saved as version ${d.version}`);
    } catch (err) {
      toast.error("Couldn't save the draft", { description: errorMessage(err), action: { label: "Retry", onClick: () => void save(copy) } });
    } finally {
      setSaving(false);
    }
  };

  const propose = async (tool: ListingToolId) => {
    if (!current) return;
    setToolBusy(tool);
    try {
      setProposal(await itemApi.proposeTool(item.id, current.key, tool));
    } catch (err) {
      toast.error("The tool didn't return a proposal", { description: errorMessage(err), action: { label: "Retry", onClick: () => void propose(tool) } });
    } finally {
      setToolBusy(null);
    }
  };

  const apply = async (p: ToolProposal) => {
    if (!current) return;
    const d = await itemApi.applyTool(item.id, current.key, p);
    onDraft(d);
    announce(`Applied "${LISTING_TOOLS.find((t) => t.id === p.tool)?.label ?? p.tool}" to the ${d.marketplaceName} draft`);
  };

  const loadVersions = () => (current ? itemApi.versions(item.id, current.key) : Promise.resolve([]));

  const restore = async (version: number) => {
    if (!current) return;
    const d = await itemApi.restore(item.id, current.key, version);
    onDraft(d);
    announce(`Restored version ${version} as version ${d.version}`);
  };

  const regenerate = async () => {
    setRegenBusy(true);
    try {
      await onRegenerate();
    } catch (err) {
      toast.error("Couldn't regenerate", { description: errorMessage(err), action: { label: "Retry", onClick: () => void regenerate() } });
    } finally {
      setRegenBusy(false);
    }
  };

  if (!current) {
    return (
      <Card id="listing">
        <CardHeader title="Listing" description="No drafts yet. Listings are written from the verified attributes after analysis." action={summary.profile ? <Button size="sm" onClick={() => void regenerate()} loading={regenBusy}>Write listing</Button> : undefined} />
      </Card>
    );
  }

  return (
    <Card id="listing">
      <CardHeader
        title="Listing"
        description="Written only from verified facts. Every draft is fact-checked against them."
        action={
          <div className="flex items-center gap-1">
            {summary.demo && <DemoBadge />}
            <VersionHistory currentVersion={current.version} load={loadVersions} onRestore={restore} />
            <Button variant="ghost" size="sm" onClick={() => void regenerate()} loading={regenBusy} leadingIcon={<RefreshCw className="size-4" aria-hidden />}>
              Regenerate
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4">
        <Tabs value={current.key} onValueChange={(v) => setActive(v as DraftKey)}>
          <div className="flex flex-wrap items-center gap-2">
            <TabsList aria-label="Listing drafts">
              {visibleTabs.map((d) => (
                <TabsTrigger key={d.key} value={d.key}>
                  {d.key === "generic" ? "Generic" : MARKETPLACES[d.key].shortName}
                </TabsTrigger>
              ))}
            </TabsList>
            {others.length > 0 && !showOthers && !(current && others.includes(current)) && (
              <Button variant="ghost" size="sm" onClick={() => setShowOthers(true)} trailingIcon={<ChevronDown className="size-4" aria-hidden />}>
                {others.length} more
              </Button>
            )}
          </div>
          {ordered.map((d) => (
            <TabsContent key={d.key} value={d.key} className="mt-4 space-y-4 focus:outline-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SelfCheckBadge selfCheck={d.selfCheck} />
                {d.key !== "generic" && <span className="text-xs text-muted">{MARKETPLACES[d.key].name} · title limit {d.limits.titleMax}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rewrite tools">
                {LISTING_TOOLS.map((t) => (
                  <Button key={t.id} variant="outline" size="sm" onClick={() => void propose(t.id)} loading={toolBusy === t.id} disabled={toolBusy !== null} title={t.description} leadingIcon={toolBusy === t.id ? undefined : <Sparkles className="size-3.5" aria-hidden />}>
                    {t.label}
                  </Button>
                ))}
              </div>
              {d.key === current.key && <DraftEditor key={`${d.id}-${d.version}`} draft={d} onSave={save} saving={saving} />}
            </TabsContent>
          ))}
        </Tabs>
      </CardBody>
      <ToolDiffDialog proposal={proposal} onApply={apply} onClose={() => setProposal(null)} />
    </Card>
  );
}

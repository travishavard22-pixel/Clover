import { fitTitle, MARKETPLACES } from "../../marketplaces/registry";
import type { Evaluator, Proposal, SnapshotItem, TitleQualityConfig } from "../types";
import { shortTitle } from "./shared";

export type TitleIssue = { code: "missing_brand" | "missing_model" | "too_long" | "all_caps" | "filler"; message: string };

const FILLER = /\b(l@@k|look!+|wow!*|must[\s-]?see|a\+{2,}|nice!+|awesome|amazing|rare!+|cheap|hot!+|wow)\b/gi;
const PUNCTUATION_RUNS = /([!?*]){2,}|\s[!*]+(?=\s|$)|^[!*]+\s/g;
const KEEP_CAPS = new Set(["USA", "UK", "EU", "NIB", "NWT", "OEM", "SLR", "DSLR", "LCD", "LED", "HD", "4K", "USB", "SSD", "RAM", "GB", "TB", "MM", "CM", "XL", "XXL", "XS", "II", "III", "IV", "V", "VI", "TV", "PC", "PS5", "PS4", "GPU", "CPU", "DVD", "CD", "OLED", "HDMI", "RGB", "AM", "FM"]);

export function titleLimitFor(item: SnapshotItem): number {
  const active = item.publications.map((p) => MARKETPLACES[p.marketplace].limits.titleMax);
  return active.length ? Math.min(...active) : 80;
}

function containsWord(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!n) return true;
  return h.includes(n);
}

function isAllCaps(title: string): boolean {
  const letters = title.replace(/[^a-z]/gi, "");
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length >= 0.8;
}

function toTitleCase(title: string, keep: string[]): string {
  const keepMap = new Map(keep.filter(Boolean).flatMap((k) => k.split(/\s+/)).map((w) => [w.toLowerCase(), w]));
  return title
    .split(/\s+/)
    .map((w) => {
      const lower = w.toLowerCase();
      if (keepMap.has(lower)) return keepMap.get(lower)!;
      const bare = w.replace(/[^a-z0-9]/gi, "");
      if (KEEP_CAPS.has(bare.toUpperCase())) return w.toUpperCase();
      if (/\d/.test(w)) return w.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Pure: finds problems in a title and builds a corrected version. */
export function analyseTitle(title: string, opts: { brand: string | null; model: string | null; limit: number; config: TitleQualityConfig }): { issues: TitleIssue[]; suggestion: string } {
  const issues: TitleIssue[] = [];
  let next = title.replace(/\s+/g, " ").trim();
  const { brand, model, limit, config } = opts;

  if (config.flagFiller && FILLER.test(next)) {
    issues.push({ code: "filler", message: "Filler words that buyers filter out" });
    next = next.replace(FILLER, " ");
  }
  FILLER.lastIndex = 0;
  if (PUNCTUATION_RUNS.test(next)) {
    if (!issues.some((i) => i.code === "filler") && config.flagFiller) issues.push({ code: "filler", message: "Repeated punctuation" });
    next = next.replace(PUNCTUATION_RUNS, " ");
  }
  PUNCTUATION_RUNS.lastIndex = 0;
  next = next.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();

  if (config.flagAllCaps && isAllCaps(next)) {
    issues.push({ code: "all_caps", message: "Written in capitals" });
    next = toTitleCase(next, [brand ?? "", model ?? ""]);
  }
  const prefix: string[] = [];
  if (config.requireBrand && brand && !containsWord(next, brand)) {
    issues.push({ code: "missing_brand", message: `Brand "${brand}" is missing` });
    prefix.push(brand);
  }
  if (config.requireModel && model && !containsWord(next, model)) {
    issues.push({ code: "missing_model", message: `Model "${model}" is missing` });
    prefix.push(model);
  }
  if (prefix.length) next = `${prefix.join(" ")} ${next}`.trim();
  if (next.length > limit) {
    if (title.length > limit) issues.push({ code: "too_long", message: `Longer than the ${limit}-character limit` });
    next = fitTitle(next, limit);
  }
  return { issues, suggestion: next };
}

export const evaluateTitleQuality: Evaluator<"TITLE_QUALITY"> = (ctx, config: TitleQualityConfig): Proposal[] => {
  const out: Proposal[] = [];
  for (const item of ctx.items) {
    if (item.status !== "READY" && item.status !== "LISTED") continue;
    const generic = item.drafts.find((d) => d.marketplace === null) ?? null;
    const current = generic?.title ?? item.title;
    if (!current.trim() || current === "Untitled item") continue;
    const brand = item.brand ?? item.profile?.brand ?? null;
    const model = item.model ?? item.profile?.model ?? null;
    const { issues, suggestion } = analyseTitle(current, { brand, model, limit: titleLimitFor(item), config });
    if (!issues.length || suggestion === current) continue;
    out.push({
      type: "TITLE_QUALITY",
      itemId: item.id,
      title: `Tidy the title for ${shortTitle(item.title)}`,
      body: `${issues.map((i) => i.message).join("; ")}. Suggested: "${suggestion}".`,
      proposal: {
        key: `title:${item.id}:${current}`,
        action: "fix_title",
        itemId: item.id,
        draftId: generic?.id ?? null,
        marketplace: null,
        fromTitle: current,
        toTitle: suggestion,
        issues: issues.map((i) => i.code),
      },
      autoExecutable: false,
      autoBlockedReason: "Live titles are never rewritten without you.",
      notifyPreference: null,
    });
  }
  return out;
};

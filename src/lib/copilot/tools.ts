import { randomUUID } from "node:crypto";
import { getAiProvider } from "../ai";
import type { CopilotTool } from "../ai/provider";
import { type ItemProfile, verifiedAttributesFromProfile } from "../ai/schemas";
import { computeReprice } from "../automations/evaluators/reprice-stale";
import { db, type ItemStatus, type Marketplace, type OfferStatus } from "../db";
import { computeMetrics, daysBetween, daysOnMarket, estimatedProfit, realisedProfit } from "../inventory/compute";
import { MARKETPLACES } from "../marketplaces/registry";
import { heuristicOfferAdvice } from "./offer-heuristics";
import type { CopilotProposal } from "./proposals";
import { COPILOT_TOOL_DEFINITIONS, LIST_SORTS, type CopilotToolName } from "./tool-schemas";

export type ProposalSink = { push: (p: CopilotProposal) => void };

type Input = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const int = (v: unknown, lo: number, hi: number, dflt: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);
const enumOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

const ITEM_STATUSES: ItemStatus[] = ["DRAFT", "ANALYZING", "READY", "LISTED", "OFFER_RECEIVED", "SOLD", "SHIPPED", "COMPLETED", "ARCHIVED"];
const MARKETPLACE_IDS = Object.keys(MARKETPLACES) as Marketplace[];
const OFFER_STATUSES: OfferStatus[] = ["PENDING", "ACCEPTED", "DECLINED", "COUNTERED", "EXPIRED", "WITHDRAWN"];

/** Every tool is scoped to `userId` at query time; an id from another seller reads as "not found". */
export function buildCopilotTools(userId: string, sink: ProposalSink, now = new Date()): CopilotTool[] {
  const runners: Record<CopilotToolName, (input: Input) => Promise<unknown>> = {
    async get_inventory_summary() {
      const [items, publications, offerItems, pendingOffers] = await Promise.all([
        db.item.findMany({ where: { userId }, select: { id: true, status: true, createdAt: true, listedAt: true, soldAt: true, soldPrice: true, soldMarketplace: true, fees: true, shippingCost: true, acquisitionCost: true, estimatedValue: true, listPrice: true } }),
        db.publication.findMany({ where: { userId }, select: { itemId: true, marketplace: true, status: true } }),
        db.offer.findMany({ where: { userId }, select: { itemId: true }, distinct: ["itemId"] }),
        db.offer.count({ where: { userId, status: "PENDING" } }),
      ]);
      const m = computeMetrics(items, publications, { now, itemsWithOffers: new Set(offerItems.map((o) => o.itemId)) });
      return {
        totalItems: items.length,
        byStatus: Object.fromEntries(m.statusBreakdown.filter((s) => s.count).map((s) => [s.status, s.count])),
        activeListings: m.activeListings,
        drafts: m.drafts,
        ready: m.ready,
        staleListings: m.shouldReprice,
        pendingOffers,
        sold30d: m.sold30d,
        revenue30dCents: m.revenue30d,
        revenueAllCents: m.revenueAll,
        realisedProfitCents: m.realisedProfit,
        inventoryValueEstimateCents: m.inventoryValueEstimate,
        inventoryValueBasis: "estimate: sum of price estimates (list price where no estimate exists)",
        avgDaysToSale: m.avgDaysToSale,
        bestMarketplaceByRevenue: m.bestByRevenue?.marketplace ?? null,
        bestMarketplaceBySellThrough: m.bestBySellThrough?.marketplace ?? null,
      };
    },

    async list_items(input) {
      const statuses = Array.isArray(input.status) ? (input.status.filter((s) => ITEM_STATUSES.includes(s as ItemStatus)) as ItemStatus[]) : [];
      const marketplace = enumOf(input.marketplace, MARKETPLACE_IDS);
      const sort = enumOf(input.sort, LIST_SORTS) ?? "newest";
      const limit = int(input.limit, 1, 50, 20);
      const orderBy = {
        newest: { createdAt: "desc" as const },
        oldest: { createdAt: "asc" as const },
        price_desc: { listPrice: { sort: "desc" as const, nulls: "last" as const } },
        price_asc: { listPrice: { sort: "asc" as const, nulls: "last" as const } },
        days_on_market: { listedAt: { sort: "asc" as const, nulls: "last" as const } },
        estimated_value: { estimatedValue: { sort: "desc" as const, nulls: "last" as const } },
      }[sort];
      const rows = await db.item.findMany({
        where: { userId, ...(statuses.length ? { status: { in: statuses } } : { status: { not: "ARCHIVED" } }), ...(marketplace ? { OR: [{ publications: { some: { marketplace } } }, { soldMarketplace: marketplace }] } : {}) },
        orderBy,
        take: limit,
        select: {
          id: true, sku: true, title: true, brand: true, model: true, status: true, categoryPath: true, conditionGrade: true, listPrice: true, floorPrice: true, estimatedValue: true, soldPrice: true, soldMarketplace: true, acquisitionCost: true, fees: true, shippingCost: true, listedAt: true, soldAt: true, createdAt: true,
          estimate: { select: { recommended: true, quickSale: true, maxValue: true, basis: true, confidence: true } },
          publications: { select: { marketplace: true, status: true, mode: true } },
          _count: { select: { offers: { where: { status: "PENDING" } }, photos: true } },
        },
      });
      return {
        count: rows.length,
        items: rows.map((i) => ({
          id: i.id,
          sku: i.sku,
          title: i.title,
          brand: i.brand,
          model: i.model,
          status: i.status,
          category: i.categoryPath.join(" › ") || null,
          condition: i.conditionGrade,
          listPriceCents: i.listPrice,
          floorPriceCents: i.floorPrice,
          estimate: i.estimate ? { recommendedCents: i.estimate.recommended, quickSaleCents: i.estimate.quickSale, maxValueCents: i.estimate.maxValue, basis: i.estimate.basis, confidence: i.estimate.confidence, label: "estimate" } : null,
          soldPriceCents: i.soldPrice,
          soldMarketplace: i.soldMarketplace,
          daysOnMarket: daysOnMarket(i, now),
          pendingOffers: i._count.offers,
          photos: i._count.photos,
          listings: i.publications.map((p) => `${p.marketplace}:${p.status}:${p.mode}`),
          realisedProfitCents: realisedProfit(i),
          estimatedProfitCents: estimatedProfit(i),
        })),
      };
    },

    async get_item(input) {
      const id = str(input.id);
      if (!id) return { error: "id is required" };
      const i = await db.item.findFirst({
        where: { id, userId },
        include: {
          profile: true,
          estimate: true,
          drafts: { select: { id: true, marketplace: true, title: true, description: true, price: true, version: true, updatedAt: true } },
          publications: { select: { id: true, marketplace: true, mode: true, status: true, price: true, externalUrl: true, publishedAt: true } },
          offers: { select: { id: true, marketplace: true, buyerName: true, amount: true, originalPrice: true, status: true, receivedAt: true, expiresAt: true, message: true }, orderBy: { receivedAt: "desc" }, take: 10 },
          _count: { select: { photos: true, comps: true } },
        },
      });
      if (!i) return { error: "Item not found" };
      const profile = i.profile?.data as ItemProfile | undefined;
      const attributes = (i.attributes ?? {}) as Record<string, unknown>;
      return {
        id: i.id,
        sku: i.sku,
        title: i.title,
        status: i.status,
        brand: i.brand,
        model: i.model,
        category: i.categoryPath,
        condition: { grade: i.conditionGrade, notes: i.conditionNotes, tier: profile?.condition.tier ?? null, summary: profile?.condition.summary ?? null, defects: profile?.condition.defects.map((d) => `${d.severity} ${d.type} at ${d.location}`) ?? [] },
        identification: profile ? { itemName: profile.itemName.value, tier: profile.identityTier, unknowns: profile.unknowns, provider: i.profile?.provider } : null,
        money: { listPriceCents: i.listPrice, floorPriceCents: i.floorPrice, acquisitionCostCents: i.acquisitionCost, soldPriceCents: i.soldPrice, feesCents: i.fees, shippingCostCents: i.shippingCost },
        estimate: i.estimate ? { quickSaleCents: i.estimate.quickSale, recommendedCents: i.estimate.recommended, maxValueCents: i.estimate.maxValue, band: { lowCents: i.estimate.low, likelyCents: i.estimate.likely, highCents: i.estimate.high }, basis: i.estimate.basis, confidence: i.estimate.confidence, compsUsed: i.estimate.compsUsed, explanation: i.estimate.explanation, label: "estimate" } : null,
        photos: i._count.photos,
        comps: i._count.comps,
        drafts: i.drafts,
        listings: i.publications,
        offers: i.offers,
        priceHistory: Array.isArray(attributes.priceHistory) ? attributes.priceHistory : [],
        daysOnMarket: daysOnMarket(i, now),
        listedAt: i.listedAt,
        soldAt: i.soldAt,
      };
    },

    async get_price_estimate(input) {
      const itemId = str(input.itemId);
      if (!itemId) return { error: "itemId is required" };
      const item = await db.item.findFirst({ where: { id: itemId, userId }, select: { id: true, title: true, listPrice: true, floorPrice: true, estimate: true, _count: { select: { comps: { where: { included: true } } } } } });
      if (!item) return { error: "Item not found" };
      if (!item.estimate) return { itemId, title: item.title, estimate: null, note: "No estimate yet — run the analysis on this item." };
      const e = item.estimate;
      return {
        itemId,
        title: item.title,
        listPriceCents: item.listPrice,
        floorPriceCents: item.floorPrice,
        estimate: { quickSaleCents: e.quickSale, recommendedCents: e.recommended, maxValueCents: e.maxValue, lowCents: e.low, likelyCents: e.likely, highCents: e.high, basis: e.basis, basisLabel: e.basis === "MARKET_EVIDENCE" ? "market evidence (comparable listings)" : "AI estimate — no comparable listings met the similarity bar", confidence: e.confidence, compsUsed: e.compsUsed, includedComps: item._count.comps, explanation: e.explanation, netByMarketplace: e.netByMarketplace, updatedAt: e.updatedAt, label: "estimate" },
        gapToRecommendedCents: item.listPrice !== null ? item.listPrice - e.recommended : null,
      };
    },

    async get_offers(input) {
      const status = enumOf(input.status, OFFER_STATUSES) ?? "PENDING";
      const offers = await db.offer.findMany({ where: { userId, status }, orderBy: { receivedAt: "desc" }, take: 30, include: { item: { select: { id: true, title: true, listPrice: true, floorPrice: true, listedAt: true, estimate: { select: { quickSale: true, recommended: true } } } } } });
      return {
        count: offers.length,
        offers: offers.map((o) => ({
          id: o.id,
          itemId: o.item.id,
          itemTitle: o.item.title,
          marketplace: o.marketplace,
          buyerName: o.buyerName,
          amountCents: o.amount,
          askingCents: o.originalPrice,
          percentBelowAsking: o.originalPrice ? Math.round(((o.originalPrice - o.amount) / o.originalPrice) * 100) : null,
          floorPriceCents: o.item.floorPrice,
          aboveFloor: o.item.floorPrice === null ? null : o.amount >= o.item.floorPrice,
          quickSaleEstimateCents: o.item.estimate?.quickSale ?? null,
          status: o.status,
          message: o.message,
          receivedAt: o.receivedAt,
          expiresAt: o.expiresAt,
          daysListed: o.item.listedAt ? daysBetween(o.item.listedAt, now) : null,
        })),
      };
    },

    async get_marketplace_performance(input) {
      const category = str(input.category)?.toLowerCase();
      const items = await db.item.findMany({ where: { userId }, select: { id: true, title: true, status: true, categoryPath: true, createdAt: true, listedAt: true, soldAt: true, soldPrice: true, soldMarketplace: true, fees: true, shippingCost: true, acquisitionCost: true, estimatedValue: true, listPrice: true } });
      const filtered = category ? items.filter((i) => [...i.categoryPath, i.title].join(" ").toLowerCase().includes(category)) : items;
      const ids = new Set(filtered.map((i) => i.id));
      const publications = (await db.publication.findMany({ where: { userId }, select: { itemId: true, marketplace: true, status: true } })).filter((p) => ids.has(p.itemId));
      const m = computeMetrics(filtered, publications, { now });
      return {
        category: category ?? null,
        itemsConsidered: filtered.length,
        marketplaces: m.marketplaces.map((s) => ({ marketplace: s.marketplace, name: MARKETPLACES[s.marketplace].name, sold: s.sold, revenueCents: s.revenue, active: s.active, sellThrough: s.sellThrough, feeRate: MARKETPLACES[s.marketplace].fees.rate, feeNote: MARKETPLACES[s.marketplace].fees.note, mode: MARKETPLACES[s.marketplace].mode })),
        bestByRevenue: m.bestByRevenue?.marketplace ?? null,
        bestBySellThrough: m.bestBySellThrough?.marketplace ?? null,
        note: m.marketplaces.length === 0 ? "No sales or listings recorded for this filter yet." : "Sell-through = sold ÷ (sold + active). Small samples are noisy.",
      };
    },

    async get_stale_listings(input) {
      const days = int(input.days, 1, 365, 14);
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      const rows = await db.item.findMany({ where: { userId, status: "LISTED", listedAt: { lte: cutoff }, offers: { none: {} } }, orderBy: { listedAt: "asc" }, take: 30, select: { id: true, title: true, listPrice: true, floorPrice: true, listedAt: true, estimate: { select: { quickSale: true, recommended: true, basis: true } }, publications: { select: { marketplace: true, status: true } } } });
      return {
        days,
        count: rows.length,
        items: rows.map((i) => {
          const suggestion = i.listPrice !== null ? computeReprice({ listPrice: i.listPrice, floorPrice: i.floorPrice, quickSale: i.estimate?.quickSale ?? null, stepPercent: 8, allowBelowQuickSale: false, minDropCents: 100 }) : null;
          return {
            id: i.id,
            title: i.title,
            listPriceCents: i.listPrice,
            floorPriceCents: i.floorPrice,
            daysListed: i.listedAt ? daysBetween(i.listedAt, now) : null,
            estimate: i.estimate ? { recommendedCents: i.estimate.recommended, quickSaleCents: i.estimate.quickSale, basis: i.estimate.basis, label: "estimate" } : null,
            suggestedPriceCents: suggestion && suggestion.ok ? suggestion.toCents : null,
            suggestionNote: suggestion && !suggestion.ok ? suggestion.reason : suggestion ? "8% step, never below floor or quick-sale estimate" : "no list price",
            marketplaces: i.publications.map((p) => `${p.marketplace}:${p.status}`),
          };
        }),
      };
    },

    async propose_price_change(input) {
      const itemId = str(input.itemId);
      const newPriceCents = typeof input.newPriceCents === "number" ? Math.round(input.newPriceCents) : NaN;
      const reason = str(input.reason) ?? "Suggested by the copilot";
      if (!itemId || !Number.isFinite(newPriceCents) || newPriceCents < 100) return { error: "itemId and newPriceCents (≥ 100) are required" };
      const item = await db.item.findFirst({ where: { id: itemId, userId }, select: { id: true, title: true, listPrice: true, floorPrice: true, status: true, estimate: { select: { quickSale: true, recommended: true } }, publications: { select: { marketplace: true, mode: true, status: true } } } });
      if (!item) return { error: "Item not found" };
      if (item.status === "SOLD" || item.status === "SHIPPED" || item.status === "COMPLETED" || item.status === "ARCHIVED") return { error: `This item is ${item.status.toLowerCase()}; its price cannot change.` };
      const warnings: string[] = [];
      if (item.floorPrice !== null && newPriceCents < item.floorPrice) return { error: `Refused: $${(newPriceCents / 100).toFixed(2)} is below the seller's floor price of $${(item.floorPrice / 100).toFixed(2)}.`, floorPriceCents: item.floorPrice };
      if (item.estimate && newPriceCents < item.estimate.quickSale) warnings.push("Below the quick-sale estimate.");
      if (item.estimate && newPriceCents > item.estimate.recommended * 1.25) warnings.push("More than 25% above the recommended estimate.");
      const assisted = item.publications.filter((p) => p.mode === "ASSISTED" && (p.status === "PUBLISHED" || p.status === "REQUIRES_USER_ACTION")).map((p) => MARKETPLACES[p.marketplace].name);
      if (assisted.length) warnings.push(`${assisted.join(" and ")} must be updated by hand.`);
      const proposal: CopilotProposal = { kind: "price_change", id: randomUUID(), itemId: item.id, itemTitle: item.title, fromCents: item.listPrice ?? 0, toCents: newPriceCents, reason, warnings };
      sink.push(proposal);
      return { proposed: true, proposalId: proposal.id, itemTitle: item.title, fromCents: item.listPrice, toCents: newPriceCents, warnings, note: "Nothing has changed. The seller sees a card to confirm or cancel." };
    },

    async rewrite_listing(input) {
      const itemId = str(input.itemId);
      const instruction = str(input.instruction);
      const marketplace = enumOf(input.marketplace, MARKETPLACE_IDS) ?? null;
      if (!itemId || !instruction) return { error: "itemId and instruction are required" };
      const item = await db.item.findFirst({ where: { id: itemId, userId }, include: { profile: true, drafts: true } });
      if (!item) return { error: "Item not found" };
      const draft = item.drafts.find((d) => d.marketplace === marketplace) ?? item.drafts.find((d) => d.marketplace === null) ?? null;
      const current = { title: draft?.title ?? item.title, description: draft?.description ?? item.conditionNotes ?? "" };
      const profile = item.profile?.data as ItemProfile | undefined;
      if (!profile) return { proposed: false, current, note: "This item has not been analysed, so there are no verified attributes to write from. Run the analysis first." };
      const prefs = await db.userPreferences.findUnique({ where: { userId } });
      const limits = marketplace ? MARKETPLACES[marketplace].limits : { titleMax: 80, descriptionMax: 4000 };
      try {
        const provider = await getAiProvider();
        const out = await provider.writeListing({
          profile,
          verifiedAttributes: verifiedAttributesFromProfile(profile).map(({ name, value }) => ({ name, value })),
          unknowns: profile.unknowns,
          marketplace: marketplace ?? "GENERIC",
          priceCents: draft?.price ?? item.listPrice,
          shipping: { offersShipping: prefs?.offersShipping ?? true, offersLocalPickup: prefs?.offersLocalPickup ?? true, note: prefs?.defaultShippingNote ?? null, city: prefs?.city ?? null },
          existing: draft ? { title: draft.title, description: draft.description, bullets: draft.bullets, conditionText: draft.conditionText, specifics: (Array.isArray(draft.specifics) ? draft.specifics : []) as Array<{ name: string; value: string }>, keywords: draft.keywords, suggestedCategoryPath: draft.categoryPath } : undefined,
          instruction,
          limits: { titleMax: limits.titleMax, descriptionMax: limits.descriptionMax },
        });
        if (out.selfCheck.verdict === "reject") return { proposed: false, current, note: `The rewrite was rejected by the self-check: ${out.selfCheck.unsupportedCount} claim(s) were not supported by the verified attributes.` };
        const proposal: CopilotProposal = {
          kind: "rewrite_listing",
          id: randomUUID(),
          itemId: item.id,
          itemTitle: item.title,
          marketplace,
          draftId: draft?.id ?? null,
          instruction,
          from: current,
          to: { title: out.copy.title, description: out.copy.description, bullets: out.copy.bullets, conditionText: out.copy.conditionText, keywords: out.copy.keywords },
          selfCheck: { verdict: out.selfCheck.verdict, unsupportedCount: out.selfCheck.unsupportedCount },
          generatedBy: `${provider.name}:${out.model}`,
        };
        sink.push(proposal);
        return { proposed: true, proposalId: proposal.id, title: out.copy.title, description: out.copy.description.slice(0, 600), selfCheck: out.selfCheck.verdict, note: "Nothing is saved until the seller confirms the card." };
      } catch (err) {
        return { proposed: false, current, note: `The listing writer is not available right now (${err instanceof Error ? err.message : "unknown error"}). Here is the current draft instead.` };
      }
    },

    async evaluate_offer(input) {
      const offerId = str(input.offerId);
      if (!offerId) return { error: "offerId is required" };
      const offer = await db.offer.findFirst({ where: { id: offerId, userId }, include: { item: { select: { id: true, title: true, listPrice: true, floorPrice: true, listedAt: true, estimate: { select: { quickSale: true, recommended: true, maxValue: true } } } } } });
      if (!offer) return { error: "Offer not found" };
      const facts = {
        offerCents: offer.amount,
        listPriceCents: offer.originalPrice || offer.item.listPrice || 0,
        floorPriceCents: offer.item.floorPrice,
        estimate: offer.item.estimate,
        daysListed: offer.item.listedAt ? daysBetween(offer.item.listedAt, now) : 0,
        feeRate: MARKETPLACES[offer.marketplace].fees.rate,
        buyerName: offer.buyerName,
      };
      const rules = heuristicOfferAdvice(facts);
      let ai: { recommendation: string; counterAmountCents: number | null; reasoning: string; suggestedMessage: string; provider: string } | null = null;
      try {
        const provider = await getAiProvider();
        const advice = await provider.offerAdvice({ itemTitle: offer.item.title, listPriceCents: facts.listPriceCents, offerCents: offer.amount, floorPriceCents: offer.item.floorPrice, estimate: offer.item.estimate, daysListed: facts.daysListed, buyerMessage: offer.message, marketplace: offer.marketplace, feeRate: facts.feeRate });
        ai = { ...advice, provider: provider.name };
      } catch {
        ai = null;
      }
      return {
        offer: { id: offer.id, itemId: offer.item.id, itemTitle: offer.item.title, marketplace: offer.marketplace, buyerName: offer.buyerName, amountCents: offer.amount, askingCents: facts.listPriceCents, floorPriceCents: offer.item.floorPrice, status: offer.status, message: offer.message, daysListed: facts.daysListed, netAfterFeesCents: Math.round(offer.amount * (1 - facts.feeRate)) },
        estimate: offer.item.estimate ? { ...offer.item.estimate, label: "estimate" } : null,
        offerAdvice: ai ?? { ...rules, provider: "rules" },
        ruleBasedCheck: rules,
        respondAt: `/offers?offer=${offer.id}`,
        note: ai ? "Advice is an estimate; the seller responds in Offers." : "The AI advisor was unavailable, so this is rule-based advice. The seller responds in Offers.",
      };
    },
  };

  return (Object.keys(COPILOT_TOOL_DEFINITIONS) as CopilotToolName[]).map((name) => ({
    name,
    description: COPILOT_TOOL_DEFINITIONS[name].description,
    inputSchema: COPILOT_TOOL_DEFINITIONS[name].inputSchema,
    run: (input: Input) => runners[name](input ?? {}),
  }));
}

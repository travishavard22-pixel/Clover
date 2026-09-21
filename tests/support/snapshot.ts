import { AUTOMATION_TYPES } from "@/lib/automations/types";
import type { EvaluationContext, SnapshotConnection, SnapshotItem, SnapshotOffer, SnapshotPreferences } from "@/lib/automations/types";
import type { AutomationMode, AutomationType } from "@/lib/db";

/**
 * Fixtures for the pure evaluators. The snapshot is the whole world an evaluator can see, so a
 * test builds one rather than mocking the database — that is the point of the snapshot's existing.
 */

export const PREFERENCES: SnapshotPreferences = {
  offersShipping: true,
  offersLocalPickup: true,
  defaultShippingNote: null,
  defaultMarketplaces: ["EBAY", "FACEBOOK"],
  notifyOffers: true,
  notifyStale: true,
  notifyPublishing: true,
  city: null,
};

export function snapshotItem(over: Partial<SnapshotItem> = {}): SnapshotItem {
  return {
    id: "item-1",
    sku: "CLV-1",
    title: "Leica M6 rangefinder",
    status: "LISTED",
    brand: "Leica",
    model: "M6",
    categoryPath: [],
    conditionGrade: "GOOD",
    attributes: {},
    listPrice: 10_000,
    floorPrice: 8000,
    estimatedValue: null,
    soldPrice: null,
    soldMarketplace: null,
    quantity: 1,
    notes: null,
    listedAt: "2026-09-01T00:00:00.000Z",
    soldAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    photos: [],
    profile: null,
    estimate: null,
    drafts: [],
    publications: [],
    offers: [],
    ...over,
  };
}

export function snapshotOffer(over: Partial<SnapshotOffer> = {}): SnapshotOffer {
  return {
    id: "off-1",
    marketplace: "EBAY",
    publicationMode: "API",
    buyerName: "Dana",
    amount: 9600,
    originalPrice: 10_000,
    status: "PENDING",
    receivedAt: "2026-09-20T00:00:00.000Z",
    expiresAt: null,
    message: null,
    ...over,
  };
}

export function evaluationContext(items: SnapshotItem[], over: Partial<EvaluationContext> = {}): EvaluationContext {
  const modes = Object.fromEntries(AUTOMATION_TYPES.map((t) => [t, "AUTO"])) as Record<AutomationType, AutomationMode>;
  const connections: SnapshotConnection[] = [{ marketplace: "EBAY", status: "CONNECTED", mode: "api" }];
  return { now: new Date("2026-09-21T00:00:00.000Z"), items, preferences: PREFERENCES, connections, modes, ...over };
}

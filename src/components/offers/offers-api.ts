import type { GuardedPublication } from "@/lib/marketplaces/sales";
import type { LogOfferInput, OfferDTO, OfferSuggestion, RespondInput } from "@/lib/offers";
import { get, post } from "@/components/marketplaces/api-client";

export type OfferableItem = { id: string; title: string; sku: string; listPrice: number | null; marketplaces: string[] };
export type RespondResponse = { offer: OfferDTO; guarded: GuardedPublication[]; repliedVia: "api" | "manual" };

export const offersApi = {
  list: () => get<{ offers: OfferDTO[]; items: OfferableItem[] }>("/api/offers?items=1"),
  log: (input: LogOfferInput) => post<{ offer: OfferDTO }>("/api/offers", input),
  advise: (id: string) => post<{ suggestion: OfferSuggestion }>(`/api/offers/${id}/advise`),
  respond: (id: string, input: RespondInput) => post<RespondResponse>(`/api/offers/${id}/respond`, input),
};

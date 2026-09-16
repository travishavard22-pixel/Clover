import type { PublishHubData, PublicationDTO, StartPublishResult } from "@/lib/marketplaces/publications";
import type { Marketplace } from "@/lib/db";
import { get, post, put } from "@/components/marketplaces/api-client";

export type PublicationMutation = { publication: PublicationDTO; jobId: string | null };

/** Client calls for the publish hub and every publication action. Server shapes are the source of truth. */
export const publishApi = {
  hub: (itemId: string) => get<PublishHubData>(`/api/items/${encodeURIComponent(itemId)}/publications`),
  start: (itemId: string, marketplaces: Marketplace[]) => post<{ results: StartPublishResult[] }>(`/api/items/${encodeURIComponent(itemId)}/publications`, { marketplaces }),
  step: (publicationId: string, key: string, done: boolean) => post<{ publication: PublicationDTO }>(`/api/publications/${publicationId}/checklist`, { key, done }),
  rebuild: (publicationId: string) => put<{ publication: PublicationDTO }>(`/api/publications/${publicationId}/checklist`),
  confirm: (publicationId: string, externalUrl: string | null) => post<{ publication: PublicationDTO }>(`/api/publications/${publicationId}/confirm`, { externalUrl }),
  end: (publicationId: string, confirmed?: boolean) => post<PublicationMutation>(`/api/publications/${publicationId}/end`, { confirmed: confirmed ?? false }),
  price: (publicationId: string, priceCents: number) => post<PublicationMutation>(`/api/publications/${publicationId}/price`, { priceCents }),
  republish: (publicationId: string) => post<PublicationMutation>(`/api/publications/${publicationId}/republish`),
  confirmAction: (publicationId: string) => post<{ publication: PublicationDTO }>(`/api/publications/${publicationId}/confirm-action`),
};

export function photoPackUrl(itemId: string, marketplace: Marketplace): string {
  return `/api/items/${encodeURIComponent(itemId)}/publications/${marketplace.toLowerCase()}/photo-pack`;
}

export function connectUrl(marketplace: Marketplace, returnTo: string): string {
  return `/api/marketplaces/${marketplace.toLowerCase()}/connect?returnTo=${encodeURIComponent(returnTo)}`;
}

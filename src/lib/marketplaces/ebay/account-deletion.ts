import { z } from "zod";
import { db, Prisma } from "../../db";
import { audit } from "../../audit";
export { challengeResponse } from "./deletion-challenge";

/**
 * eBay Marketplace Account Deletion/Closure notifications (required for any app that stores eBay
 * user data). eBay first validates the endpoint with a GET challenge, then POSTs a notification
 * whenever a user whose data we hold closes their account. We must acknowledge every valid
 * notification with 2xx and erase the data we derived from that account.
 */

export const AccountDeletionSchema = z.object({
  metadata: z.object({ topic: z.string().min(1), schemaVersion: z.string().optional(), deprecated: z.boolean().optional() }),
  notification: z.object({
    notificationId: z.string().min(1),
    eventDate: z.string().min(1),
    publishDate: z.string().optional(),
    publishAttemptCount: z.number().int().optional(),
    data: z.object({ username: z.string().min(1), userId: z.string().min(1), eiasToken: z.string().optional() }),
  }),
});
export type AccountDeletionPayload = z.infer<typeof AccountDeletionSchema>;

export const ACCOUNT_DELETION_TOPIC = "MARKETPLACE_ACCOUNT_DELETION";

export type AccountDeletionResult = { matched: number; connectionsDeleted: number; offersDeleted: number; publicationsScrubbed: number };

/**
 * Erases what Clover derived from the closed eBay account: the connection (tokens, account name,
 * scopes), the offers eBay sent us, and the eBay identifiers on publications. The seller's own
 * items, photos and drafts are theirs, not eBay's, and stay. Idempotent — a repeated notification
 * finds nothing and returns zeros.
 */
export async function eraseEbayAccountData(data: AccountDeletionPayload["notification"]["data"]): Promise<AccountDeletionResult> {
  const connections = await db.marketplaceConnection.findMany({
    where: { marketplace: "EBAY", OR: [{ externalAccountId: data.userId }, { externalAccountName: data.username }] },
    select: { id: true, userId: true },
  });
  if (connections.length === 0) return { matched: 0, connectionsDeleted: 0, offersDeleted: 0, publicationsScrubbed: 0 };
  const userIds = [...new Set(connections.map((c) => c.userId))];
  const result = await db.$transaction(async (tx) => {
    const offers = await tx.offer.deleteMany({ where: { userId: { in: userIds }, marketplace: "EBAY", externalId: { not: null } } });
    const publications = await tx.publication.updateMany({
      where: { userId: { in: userIds }, marketplace: "EBAY" },
      data: { externalId: null, externalUrl: null, externalMeta: {} as Prisma.InputJsonValue, connectionId: null, lastSyncAt: null },
    });
    const deleted = await tx.marketplaceConnection.deleteMany({ where: { id: { in: connections.map((c) => c.id) } } });
    return { connectionsDeleted: deleted.count, offersDeleted: offers.count, publicationsScrubbed: publications.count };
  });
  for (const userId of userIds) {
    await audit({ userId, action: "ebay.account_deletion", entityType: "marketplace_connection", meta: { ebayUserId: data.userId, ...result } });
  }
  return { matched: connections.length, ...result };
}

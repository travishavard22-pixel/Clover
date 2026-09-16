import { db, type Marketplace } from "../db";
import { randomToken } from "../crypto";

/**
 * Single-use OAuth `state` tokens, stored in the better-auth `Verification` table so they survive
 * across instances and expire on their own. A state is bound to the user who started the flow and
 * to the marketplace, so a callback can never attach an account to a different Clover user.
 */
const TTL_MS = 10 * 60 * 1000;

function identifier(marketplace: Marketplace, userId: string) {
  return `oauth-state:${marketplace}:${userId}`;
}

export async function issueOAuthState(userId: string, marketplace: Marketplace): Promise<string> {
  const value = randomToken(32);
  const now = new Date();
  await db.verification.create({
    data: { id: randomToken(16), identifier: identifier(marketplace, userId), value, expiresAt: new Date(now.getTime() + TTL_MS), createdAt: now, updatedAt: now },
  });
  // Housekeeping: drop expired states for this user/marketplace so the table does not grow.
  await db.verification.deleteMany({ where: { identifier: identifier(marketplace, userId), expiresAt: { lt: now } } });
  return value;
}

/** True when the state exists and has not expired. Does not consume it. */
export async function peekOAuthState(userId: string, marketplace: Marketplace, value: string): Promise<boolean> {
  if (!value) return false;
  const row = await db.verification.findFirst({ where: { identifier: identifier(marketplace, userId), value, expiresAt: { gt: new Date() } }, select: { id: true } });
  return !!row;
}

/** Verifies and deletes the state in one step. Returns false when unknown, expired or already used. */
export async function consumeOAuthState(userId: string, marketplace: Marketplace, value: string): Promise<boolean> {
  if (!value) return false;
  const row = await db.verification.findFirst({ where: { identifier: identifier(marketplace, userId), value, expiresAt: { gt: new Date() } }, select: { id: true } });
  if (!row) return false;
  const deleted = await db.verification.deleteMany({ where: { id: row.id } });
  return deleted.count === 1;
}

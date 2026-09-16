import { NextResponse } from "next/server";
import { apiError, withPublic } from "@/lib/api";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ACCOUNT_DELETION_TOPIC, AccountDeletionSchema, challengeResponse, eraseEbayAccountData } from "@/lib/marketplaces/ebay/account-deletion";
import { verifyEbayNotification } from "@/lib/marketplaces/ebay/notification-signature";

export const dynamic = "force-dynamic";

/** The public URL eBay was given for this endpoint (must match byte-for-byte in the challenge hash). */
function endpointUrl(req: Request): string {
  const configured = new URL("/api/webhooks/ebay/account-deletion", env.APP_URL);
  const actual = new URL(req.url);
  // Prefer the configured origin (behind proxies req.url is the internal one); keep the path constant.
  return `${configured.origin}${actual.pathname}`;
}

/**
 * GET ?challenge_code=… → { challengeResponse }
 * eBay's endpoint validation. Without a verification token configured the endpoint is not
 * enabled, and we say so rather than answering with a guessable hash.
 */
export const GET = withPublic(
  async (req) => {
    const token = env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN;
    if (!token) return apiError(503, "eBay account deletion notifications are not configured on this deployment.", "not_configured");
    const code = new URL(req.url).searchParams.get("challenge_code");
    if (!code) return apiError(400, "challenge_code is required", "validation");
    return NextResponse.json({ challengeResponse: challengeResponse(code, token, endpointUrl(req)) }, { headers: { "Cache-Control": "no-store" } });
  },
  { rateLimit: { key: "ebay-deletion-challenge", limit: 30, windowSeconds: 60 } },
);

/**
 * POST — a MARKETPLACE_ACCOUNT_DELETION notification. The X-EBAY-SIGNATURE header is verified
 * against eBay's published key before the body is even parsed (412 otherwise — usernames are
 * public, so an unsigned request must never erase anything). Shape is validated (400); once valid
 * we always answer 200 so eBay stops retrying, even when we hold nothing for that user.
 */
export const POST = withPublic(
  async (req, { ip }) => {
    if (!env.EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN) return apiError(503, "eBay account deletion notifications are not configured on this deployment.", "not_configured");
    const raw = await req.text();
    const verified = await verifyEbayNotification(req.headers.get("x-ebay-signature"), raw);
    if (!verified.ok) {
      await audit({ action: "webhook.ebay.account_deletion.rejected", entityType: "webhook", meta: { reason: verified.reason }, ip });
      return apiError(412, "Notification signature could not be verified.", verified.reason);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return apiError(400, "Body must be JSON", "bad_json");
    }
    const parsed = AccountDeletionSchema.safeParse(body);
    if (!parsed.success) return apiError(400, "Invalid notification", "validation", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    const { metadata, notification } = parsed.data;
    if (metadata.topic !== ACCOUNT_DELETION_TOPIC) return apiError(400, `Unexpected topic ${metadata.topic}`, "validation");
    try {
      const result = await eraseEbayAccountData(notification.data);
      await audit({ action: "webhook.ebay.account_deletion", entityType: "webhook", entityId: notification.notificationId, meta: { ebayUserId: notification.data.userId, ...result }, ip });
    } catch (err) {
      // Log and still acknowledge: eBay retries only on non-2xx, and a retry storm does not help us erase faster.
      console.error("[webhooks/ebay/account-deletion]", err);
      await audit({ action: "webhook.ebay.account_deletion.error", entityType: "webhook", entityId: notification.notificationId, meta: { error: err instanceof Error ? err.message : String(err) }, ip });
    }
    return new NextResponse(null, { status: 200 });
  },
  { rateLimit: { key: "ebay-deletion-notify", limit: 120, windowSeconds: 60 } },
);

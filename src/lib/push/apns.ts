import http2 from "node:http2";
import { env } from "../env";
import { signJwtEs256 } from "./jwt";
import type { PushMessage, PushOutcome, PushProvider } from "./types";

export type ApnsConfig = { keyId: string; teamId: string; privateKey: string; bundleId: string; environment: "sandbox" | "production" };

/** The APNs payload for a device: an alert plus the link to open. */
export function apnsPayload(m: PushMessage) {
  return { aps: { alert: { title: m.title, body: m.body }, sound: "default", "mutable-content": 0 }, href: m.href ?? "/notifications", notificationId: m.notificationId ?? "" };
}

type Cached = { token: string; issuedAt: number };
const g = globalThis as unknown as { __apnsToken?: Cached };

/**
 * Apple Push Notification service over HTTP/2 with token-based authentication. One provider
 * token is reused for up to 50 minutes, as Apple asks (tokens older than an hour are rejected,
 * refreshing more than every 20 minutes is discouraged).
 */
export class ApnsProvider implements PushProvider {
  readonly name = "apns";
  constructor(private cfg: ApnsConfig) {}

  private providerToken(): string {
    const cached = g.__apnsToken;
    if (cached && Date.now() - cached.issuedAt < 50 * 60_000) return cached.token;
    const iat = Math.floor(Date.now() / 1000);
    const token = signJwtEs256({ iss: this.cfg.teamId, iat }, this.cfg.privateKey.replace(/\\n/g, "\n"), { kid: this.cfg.keyId });
    g.__apnsToken = { token, issuedAt: Date.now() };
    return token;
  }

  send(deviceToken: string, message: PushMessage): Promise<PushOutcome> {
    const host = this.cfg.environment === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    return new Promise((resolve) => {
      let settled = false;
      const done = (o: PushOutcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        client.close();
        resolve(o);
      };
      const client = http2.connect(host);
      const timer = setTimeout(() => done({ ok: false, invalidToken: false, error: "APNs timeout" }), 10_000);
      client.on("error", (err) => done({ ok: false, invalidToken: false, error: err.message }));
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${this.providerToken()}`,
        "apns-topic": this.cfg.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0;
      let body = "";
      req.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      req.setEncoding("utf8");
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        if (status === 200) return done({ ok: true });
        let reason = "";
        try {
          reason = (JSON.parse(body) as { reason?: string }).reason ?? "";
        } catch {
          reason = body.slice(0, 100);
        }
        // 410 Unregistered and 400 BadDeviceToken mean the device is gone.
        const invalidToken = status === 410 || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic";
        done({ ok: false, invalidToken, error: `APNs ${status}: ${reason}` });
      });
      req.on("error", (err) => done({ ok: false, invalidToken: false, error: err.message }));
      req.end(JSON.stringify(apnsPayload(message)));
    });
  }
}

export function apnsProviderFromEnv(): ApnsProvider | null {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_PRIVATE_KEY) return null;
  return new ApnsProvider({ keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, privateKey: env.APNS_PRIVATE_KEY, bundleId: env.APNS_BUNDLE_ID, environment: env.APNS_ENV });
}

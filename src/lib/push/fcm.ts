import { env } from "../env";
import { signJwtRs256 } from "./jwt";
import type { PushMessage, PushOutcome, PushProvider } from "./types";

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

/** Accepts the raw service-account JSON or its base64 encoding (easier to paste into a host's env UI). */
export function parseServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const parsed = JSON.parse(text) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) throw new Error("FCM service account JSON is missing project_id, client_email or private_key");
  return { project_id: parsed.project_id, client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n"), token_uri: parsed.token_uri };
}

/** The FCM HTTP v1 message for a device token: a visible notification plus the link to open. */
export function fcmMessage(token: string, m: PushMessage) {
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data: { href: m.href ?? "/notifications", notificationId: m.notificationId ?? "" },
      android: { priority: "HIGH", notification: { channel_id: "clover", default_sound: true } },
      apns: { payload: { aps: { sound: "default" } } },
    },
  };
}

type Cached = { token: string; expiresAt: number };
const g = globalThis as unknown as { __fcmToken?: Cached };

export class FcmProvider implements PushProvider {
  readonly name = "fcm";
  private account: ServiceAccount;
  constructor(raw: string, private fetchImpl: typeof fetch = fetch) {
    this.account = parseServiceAccount(raw);
  }

  private async accessToken(): Promise<string> {
    const cached = g.__fcmToken;
    if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const tokenUri = this.account.token_uri ?? "https://oauth2.googleapis.com/token";
    const assertion = signJwtRs256({ iss: this.account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: tokenUri, iat: now, exp: now + 3600 }, this.account.private_key);
    const res = await this.fetchImpl(tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
    if (!res.ok) throw new Error(`FCM token exchange failed (${res.status})`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    g.__fcmToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  async send(token: string, message: PushMessage): Promise<PushOutcome> {
    try {
      const bearer = await this.accessToken();
      const res = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.account.project_id)}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify(fcmMessage(token, message)),
      });
      if (res.ok) return { ok: true };
      const text = await res.text().catch(() => "");
      // UNREGISTERED (404) and INVALID_ARGUMENT on the token (400) mean the device is gone.
      const invalidToken = res.status === 404 || (res.status === 400 && /registration token|INVALID_ARGUMENT/i.test(text));
      return { ok: false, invalidToken, error: `FCM ${res.status}: ${text.slice(0, 200)}` };
    } catch (err) {
      return { ok: false, invalidToken: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export function fcmProviderFromEnv(): FcmProvider | null {
  return env.FCM_SERVICE_ACCOUNT_JSON ? new FcmProvider(env.FCM_SERVICE_ACCOUNT_JSON) : null;
}

import { createVerify, generateKeyPairSync, verify as verifyRaw } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apnsPayload } from "@/lib/push/apns";
import { FcmProvider, fcmMessage, parseServiceAccount } from "@/lib/push/fcm";
import { signJwtEs256, signJwtRs256 } from "@/lib/push/jwt";
import { RegisterDeviceSchema, providerFor } from "@/lib/push";

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("push JWTs", () => {
  it("signs RS256 tokens Google can verify", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = signJwtRs256({ iss: "svc@example.iam.gserviceaccount.com", scope: "s", aud: "a", iat: 1, exp: 2 }, privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    const [h, b, sig] = jwt.split(".");
    expect(decode(h!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(b!)).toMatchObject({ iss: "svc@example.iam.gserviceaccount.com" });
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${b}`);
    expect(v.verify(publicKey, Buffer.from(sig!, "base64url"))).toBe(true);
  });

  it("signs ES256 tokens with the raw signature Apple requires and the key id in the header", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwt = signJwtEs256({ iss: "TEAM123", iat: 1 }, privateKey.export({ type: "pkcs8", format: "pem" }).toString(), { kid: "KEY456" });
    const [h, b, sig] = jwt.split(".");
    expect(decode(h!)).toEqual({ alg: "ES256", typ: "JWT", kid: "KEY456" });
    const raw = Buffer.from(sig!, "base64url");
    expect(raw.length).toBe(64);
    expect(verifyRaw("sha256", Buffer.from(`${h}.${b}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
  });
});

describe("push payloads", () => {
  it("builds an FCM message with a visible notification and the link to open", () => {
    const m = fcmMessage("tok", { title: "New offer", body: "$40 on the lamp", href: "/offers?offer=1" });
    expect(m.message.token).toBe("tok");
    expect(m.message.notification).toEqual({ title: "New offer", body: "$40 on the lamp" });
    expect(m.message.data.href).toBe("/offers?offer=1");
    expect(m.message.android.notification.channel_id).toBe("clover");
  });

  it("builds an APNs alert with a default link", () => {
    const p = apnsPayload({ title: "Ready for review", body: "Canon AE-1" });
    expect(p.aps.alert).toEqual({ title: "Ready for review", body: "Canon AE-1" });
    expect(p.href).toBe("/notifications");
  });

  it("accepts a raw or base64 service account and normalises escaped newlines", () => {
    const account = { project_id: "p", client_email: "e@x", private_key: "-----BEGIN\\nKEY-----" };
    expect(parseServiceAccount(JSON.stringify(account)).private_key).toContain("\n");
    expect(parseServiceAccount(Buffer.from(JSON.stringify(account)).toString("base64")).project_id).toBe("p");
    expect(() => parseServiceAccount(JSON.stringify({ project_id: "p" }))).toThrow(/missing/);
  });
});

describe("FCM delivery", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = JSON.stringify({ project_id: "demo", client_email: "svc@demo.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), token_uri: "https://oauth.test/token" });

  function fakeFetch(sendStatus: number, sendBody = "") {
    const calls: string[] = [];
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://oauth.test/token") {
        expect(String(init?.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
        return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer at");
      return new Response(sendBody, { status: sendStatus });
    }) as typeof fetch;
    return { impl, calls };
  }

  it("exchanges the service-account JWT for a token and posts the message", async () => {
    (globalThis as { __fcmToken?: unknown }).__fcmToken = undefined;
    const { impl, calls } = fakeFetch(200);
    const outcome = await new FcmProvider(account, impl).send("device-token", { title: "t", body: "b" });
    expect(outcome).toEqual({ ok: true });
    expect(calls[1]).toBe("https://fcm.googleapis.com/v1/projects/demo/messages:send");
  });

  it("flags a gone device so the registry can drop it", async () => {
    const { impl } = fakeFetch(404, '{"error":{"status":"NOT_FOUND","message":"Requested entity was not found."}}');
    const outcome = await new FcmProvider(account, impl).send("device-token", { title: "t", body: "b" });
    expect(outcome).toMatchObject({ ok: false, invalidToken: true });
  });
});

describe("device registry", () => {
  it("validates registrations and routes platforms to providers", () => {
    expect(RegisterDeviceSchema.safeParse({ token: "x".repeat(20), platform: "android" }).success).toBe(true);
    expect(RegisterDeviceSchema.safeParse({ token: "short", platform: "android" }).success).toBe(false);
    expect(RegisterDeviceSchema.safeParse({ token: "x".repeat(20), platform: "windows" }).success).toBe(false);
    const fcm = { name: "fcm", send: async () => ({ ok: true as const }) };
    const apns = { name: "apns", send: async () => ({ ok: true as const }) };
    expect(providerFor("ios", { apns, fcm })?.name).toBe("apns");
    expect(providerFor("ios", { apns: null, fcm })?.name).toBe("fcm");
    expect(providerFor("android", { apns, fcm })?.name).toBe("fcm");
    expect(providerFor("android", { apns, fcm: null })).toBeNull();
  });
});

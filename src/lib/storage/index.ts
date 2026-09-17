import { createHmac, hkdfSync } from "node:crypto";
import { safeEqual } from "../crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env";

export type PutOptions = { contentType: string; cacheControl?: string };
export type StoredObject = { key: string; bytes: number };

export interface StorageDriver {
  put(key: string, data: Buffer, opts: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Absolute URL a browser (or a marketplace fetching images) can GET until `expiresInSeconds`. */
  url(key: string, expiresInSeconds?: number): Promise<string>;
}

const SAFE_KEY = /^[a-zA-Z0-9_\-./]+$/;
export function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..") || key.startsWith("/")) throw new Error(`Unsafe storage key: ${key}`);
}

// ─── Signed URLs for the local driver (and as a generic auth-less link) ───
let fileSigningKey: Buffer | null = null;
/** A purpose-specific key derived from the auth secret, so file links never share key material with sessions. */
function signingKey(): Buffer {
  return (fileSigningKey ??= Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", "clover:file-url:v1", 32)));
}
function signKey(key: string, exp: number): string {
  return createHmac("sha256", signingKey()).update(`${key}:${exp}`).digest("base64url");
}
export function signedFileUrl(key: string, expiresInSeconds = 3600, absolute = true): string {
  assertSafeKey(key);
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = signKey(key, exp);
  const rel = `/api/files/${key}?exp=${exp}&sig=${sig}`;
  return absolute ? new URL(rel, env.APP_URL).toString() : rel;
}
export function verifySignedFile(key: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signKey(key, expNum), sig);
}

// ─── Local filesystem driver ───
class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private abs(key: string) {
    assertSafeKey(key);
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer): Promise<StoredObject> {
    const p = this.abs(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
    return { key, bytes: data.length };
  }
  async get(key: string) {
    try {
      return await readFile(this.abs(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async delete(key: string) {
    await rm(this.abs(key), { force: true });
  }
  async exists(key: string) {
    try {
      await stat(this.abs(key));
      return true;
    } catch {
      return false;
    }
  }
  async url(key: string, expiresInSeconds = 3600) {
    return signedFileUrl(key, expiresInSeconds);
  }
}

// ─── S3-compatible driver (AWS S3, Cloudflare R2, MinIO) ───
class S3Driver implements StorageDriver {
  private clientPromise: Promise<{
    client: import("@aws-sdk/client-s3").S3Client;
    cmds: typeof import("@aws-sdk/client-s3");
    presign: typeof import("@aws-sdk/s3-request-presigner").getSignedUrl;
  }> | null = null;
  constructor(private bucket: string) {}
  private async sdk() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const cmds = await import("@aws-sdk/client-s3");
        const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
        const client = new cmds.S3Client({
          region: env.S3_REGION,
          endpoint: env.S3_ENDPOINT || undefined,
          forcePathStyle: !!env.S3_ENDPOINT,
          credentials:
            env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
              ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
              : undefined,
        });
        return { client, cmds, presign: getSignedUrl };
      })();
    }
    return this.clientPromise;
  }
  async put(key: string, data: Buffer, opts: PutOptions): Promise<StoredObject> {
    assertSafeKey(key);
    const { client, cmds } = await this.sdk();
    await client.send(
      new cmds.PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: opts.contentType, CacheControl: opts.cacheControl }),
    );
    return { key, bytes: data.length };
  }
  async get(key: string) {
    assertSafeKey(key);
    const { client, cmds } = await this.sdk();
    try {
      const res = await client.send(new cmds.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
  async delete(key: string) {
    assertSafeKey(key);
    const { client, cmds } = await this.sdk();
    await client.send(new cmds.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async exists(key: string) {
    assertSafeKey(key);
    const { client, cmds } = await this.sdk();
    try {
      await client.send(new cmds.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
  async url(key: string, expiresInSeconds = 3600) {
    assertSafeKey(key);
    const { client, cmds, presign } = await this.sdk();
    return presign(client, new cmds.GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }
}

const g = globalThis as unknown as { __cloverStorage?: StorageDriver };
/**
 * Files on the container's own disk. In production that disk is ephemeral and private to a single
 * service, so a separate worker cannot read what the web service wrote — say so at startup rather
 * than failing later with a photo that cannot be found.
 */
function localDriver(): LocalDriver {
  if (env.NODE_ENV === "production") {
    console.warn("[storage] STORAGE_DRIVER=local in production: uploads stay on this container's disk, are lost on redeploy, and are invisible to other services. Set STORAGE_DRIVER=s3 with the S3_* variables (docs/runbooks/hosted-setup.md).");
  }
  return new LocalDriver(path.resolve(env.STORAGE_LOCAL_DIR));
}

export const storage: StorageDriver =
  g.__cloverStorage ??
  (g.__cloverStorage =
    env.STORAGE_DRIVER === "s3" && env.S3_BUCKET ? new S3Driver(env.S3_BUCKET) : localDriver());

export function photoKey(userId: string, itemId: string, photoId: string, variant: "orig" | "thumb" | "web" | "studio", ext = "jpg") {
  return `users/${userId}/items/${itemId}/${photoId}-${variant}.${ext}`;
}

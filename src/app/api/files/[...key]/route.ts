import { NextRequest, NextResponse } from "next/server";
import { storage, verifySignedFile, assertSafeKey } from "@/lib/storage";
import { requireUserApi } from "@/lib/session";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", zip: "application/zip", json: "application/json" };

/**
 * Serves stored files. Access is granted either by a signed URL (HMAC + expiry) or by
 * an authenticated session whose user id is the owner segment of the key.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return new NextResponse("Bad key", { status: 400 });
  }
  const url = req.nextUrl;
  let allowed = verifySignedFile(key, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!allowed) {
    const user = await requireUserApi(req);
    allowed = !!user && key.startsWith(`users/${user.id}/`);
  }
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const data = await storage.get(key);
  if (!data) return new NextResponse("Not found", { status: 404 });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600, immutable",
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

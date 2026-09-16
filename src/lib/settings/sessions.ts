import { db } from "../db";

export type SessionDTO = {
  /** Opaque row id. The session token itself never leaves the server. */
  id: string;
  current: boolean;
  ipAddress: string | null;
  device: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

/** A short, human description of a user agent: "Chrome on macOS", "Safari on iPhone". */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl\//i.test(ua) ? "curl" : "Browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null;
  return os ? `${browser} on ${os}` : browser;
}

export async function listUserSessions(userId: string, currentToken: string | null): Promise<SessionDTO[]> {
  const rows = await db.session.findMany({ where: { userId, expiresAt: { gt: new Date() } }, orderBy: { updatedAt: "desc" } });
  return rows
    .map((s) => ({
      id: s.id,
      current: s.token === currentToken,
      ipAddress: s.ipAddress ?? null,
      device: describeUserAgent(s.userAgent),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

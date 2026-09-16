import { json, withUser } from "@/lib/api";
import { getAttention } from "@/lib/inventory";

/** GET /api/dashboard/attention?limit=30 → { rows: AttentionRow[] } sorted by urgency, then recency. */
export const GET = withUser(async (req, { user }) => {
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? "");
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(100, Math.floor(raw)) : 30;
  const rows = await getAttention(user.id, { limit });
  return json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
});

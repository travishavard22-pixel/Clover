import { json, withUser } from "@/lib/api";
import { getConnections } from "@/lib/marketplaces";

/** GET /api/marketplaces → { connections: ConnectionRow[] } — one row per marketplace, defaults first. */
export const GET = withUser(async (_req, { user }) => {
  const connections = await getConnections(user.id);
  return json({ connections });
});

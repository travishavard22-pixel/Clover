import { json, withUser } from "@/lib/api";
import { getMetrics } from "@/lib/inventory";

/** GET /api/dashboard/metrics → DashboardMetrics (see src/lib/inventory/metrics.ts). */
export const GET = withUser(async (_req, { user }) => {
  const metrics = await getMetrics(user.id);
  return json(metrics, { headers: { "Cache-Control": "private, no-store" } });
});

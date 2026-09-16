import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { BatchSchema, runBatch } from "@/lib/inventory";

/**
 * POST /api/items/batch { ids, op, params }
 *   op: set_status {status} | archive | unarchive | delete | set_storage {storageLocation} |
 *       reprice {mode:"absolute",cents} | reprice {mode:"percent",percent,round?} | export_csv
 * → { op, applied, skipped, results: [{ id, ok, reason?, before?, after? }], csv? }
 * export_csv with Accept: text/csv streams the file directly.
 */
export const POST = withUser(
  async (req, { user }) => {
    const input = await parseBody(req, BatchSchema);
    const result = await runBatch(user.id, input, requestMeta(req));
    if (input.op === "export_csv" && result.csv !== undefined && req.headers.get("accept")?.includes("text/csv")) {
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(result.csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="clover-inventory-${stamp}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return json(result);
  },
  { rateLimit: { key: "items-batch", limit: 60, windowSeconds: 600 } },
);

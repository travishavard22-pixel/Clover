"use client";
import { Money } from "@/components/ui/money";
import { Tooltip } from "@/components/ui/tooltip";
import type { Marketplace } from "@/lib/db";
import type { NetByMarketplace } from "@/lib/pricing/types";

/** What the seller keeps per marketplace at the selected price, shipped and local. */
export function NetTable({ net, defaults }: { net: NetByMarketplace; defaults: Marketplace[] }) {
  const rows = (Object.keys(net) as Marketplace[]).sort((a, b) => Number(defaults.includes(b)) - Number(defaults.includes(a)));
  return (
    <div className="overflow-x-auto hide-scrollbar -mx-1 px-1">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">Estimated take-home by marketplace at the recommended price</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              Marketplace
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Shipped
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Local
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {rows.map((m) => {
            const r = net[m];
            return (
              <tr key={m}>
                <th scope="row" className="py-2 pr-3 text-left font-normal text-primary">
                  <Tooltip content={r.feeNote}>
                    <span className="cursor-help underline decoration-dotted underline-offset-2">{r.name}</span>
                  </Tooltip>
                  {defaults.includes(m) && <span className="sr-only"> (default)</span>}
                </th>
                <td className="py-2 pr-3 text-right">
                  {r.shipped ? (
                    <Tooltip content={`Fees ${fmt(r.shipped.fees)} · shipping ${fmt(r.shipped.shippingCost)}`}>
                      <span className="cursor-help">
                        <Money cents={r.shipped.net} className="font-medium text-primary" />
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-muted">No shipping</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {r.local ? (
                    <Tooltip content={`Fees ${fmt(r.local.fees)}`}>
                      <span className="cursor-help">
                        <Money cents={r.local.net} className="font-medium text-primary" />
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="text-muted">No local</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-secondary">Fees use each marketplace&apos;s published rate and are estimates. Shipping uses the item&apos;s shipping cost.</p>
    </div>
  );
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

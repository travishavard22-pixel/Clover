import { cn } from "@/lib/utils/cn";

/**
 * Consistent chart shell: title, plain-language caption, the plot, and a visually hidden data table
 * so every value is reachable without the chart or a pointer.
 */
export function ChartFrame({
  title,
  caption,
  children,
  table,
  className,
  empty,
}: {
  title: string;
  caption?: string | null;
  children: React.ReactNode;
  table: { caption: string; columns: string[]; rows: Array<Array<string | number>> };
  className?: string;
  empty?: string | null;
}) {
  return (
    <section className={cn("surface-card flex flex-col p-5", className)} aria-labelledby={`chart-${slug(title)}`}>
      <h2 id={`chart-${slug(title)}`} className="text-base font-semibold text-primary">
        {title}
      </h2>
      {caption && <p className="mt-1 text-sm text-secondary">{caption}</p>}
      <div className="mt-4 min-h-[220px] flex-1">
        {empty ? <div className="flex h-full min-h-[220px] items-center justify-center rounded-sm border border-dashed border-border-default px-6 text-center text-sm text-muted">{empty}</div> : children}
      </div>
      {/* The hiding goes on a wrapper, not on the table. `sr-only` works by pinning a box to 1×1
          with overflow hidden, and a table ignores that: table layout takes the larger of the
          specified and min-content width, so the table laid out at its full width and — being
          absolutely positioned — dragged the page's scroll width out with it. On /insights that
          was 400px of sideways panning on a phone from five invisible tables. */}
      <div className="sr-only">
        <table>
          <caption>{table.caption}</caption>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

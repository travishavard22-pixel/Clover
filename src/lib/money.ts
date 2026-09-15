/** All money is stored as integer minor units (cents). These helpers keep formatting consistent. */

export function formatMoney(cents: number | null | undefined, currency = "USD", opts: { compact?: boolean } = {}): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  const value = cents / 100;
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts.compact && Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return fmt.format(value);
}

export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function roundToPricePoint(cents: number): number {
  // Marketplace-friendly price points: $x.99 under $50, whole dollars under $200, $5 steps above.
  const dollars = cents / 100;
  if (dollars < 10) return Math.max(100, Math.round(dollars) * 100);
  if (dollars < 50) return Math.round(dollars) * 100 - 1;
  if (dollars < 200) return Math.round(dollars) * 100;
  return Math.round(dollars / 5) * 500;
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

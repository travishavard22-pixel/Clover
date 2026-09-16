/** Shared relative-time and count formatting for the marketplace surfaces. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysLiveLabel(days: number | null, status?: string): string {
  if (days === null) return "";
  const span = days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`;
  if (status === "SOLD") return days === 0 ? "Sold today" : `Sold after ${span}`;
  if (status === "ENDED") return days === 0 ? "Ended today" : `Ended after ${span}`;
  return days === 0 ? "Live today" : `${span} live`;
}

/** "in 2 days", "in 3 hours", or "now" for a future timestamp. */
export function timeUntil(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `in ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function signedPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(Math.abs(pct) % 1 === 0 ? 0 : 1)}%`;
}

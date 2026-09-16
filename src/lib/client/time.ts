/** "just now", "4 min ago", "3 days ago" — for activity lines. Pure; safe on the server. */
export function relativeTime(iso: string | Date, now: number = Date.now()): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, now - t);
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(mo / 12);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

/** "in 3 days" for snoozes and expiries. */
export function untilTime(iso: string | Date, now: number = Date.now()): string {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const diff = t - now;
  if (!Number.isFinite(diff) || diff <= 0) return "now";
  const h = Math.round(diff / 3_600_000);
  if (h < 1) return "in under an hour";
  if (h < 24) return `in ${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

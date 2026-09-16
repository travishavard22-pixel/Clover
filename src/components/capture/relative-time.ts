/** "just now", "4 min ago", "yesterday" — for draft cards. Pure; safe on the server. */
export function relativeTime(from: Date | string, now: Date = new Date()): string {
  const t = typeof from === "string" ? new Date(from) : from;
  const diff = Math.max(0, now.getTime() - t.getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

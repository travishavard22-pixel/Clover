"use client";
import { useEffect, useState } from "react";
import { relativeTime, untilTime } from "./time";

/**
 * Relative time that survives hydration: the server's wording may differ from the client's by a
 * minute, so the text is allowed to differ and is refreshed after mount and every 30 seconds.
 */
export function TimeAgo({ iso, mode = "ago", className }: { iso: string; mode?: "ago" | "until"; className?: string }) {
  const [now, setNow] = useState<number | undefined>(undefined);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const text = mode === "ago" ? relativeTime(iso, now) : untilTime(iso, now);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}

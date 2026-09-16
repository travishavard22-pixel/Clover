"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

/** Unread badge for the top bar. Polls every 60s; cheap and good enough for a personal seller account. */
export function NotificationsBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/notifications?limit=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setUnread(Number(d.unread) || 0))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return (
    <Link href="/notifications" className="relative inline-flex size-10 items-center justify-center rounded-xs hover:bg-surface-sunken" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
      <Bell className="size-5" strokeWidth={1.75} aria-hidden />
      {unread > 0 && (
        <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 tabular text-on-accent" aria-hidden>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

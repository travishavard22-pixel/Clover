"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { NotificationDTO } from "@/lib/inventory";

async function markRead(input: { all: true } | { ids: string[] }) {
  const res = await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error("Could not update notifications");
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await markRead({ all: true });
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Something went wrong");
        } finally {
          setLoading(false);
        }
      }}
    >
      Mark all read
    </Button>
  );
}

export function NotificationRow({ n }: { n: NotificationDTO }) {
  const router = useRouter();
  const unread = !n.readAt;
  const time = new Date(n.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const body = (
    <>
      <span className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-accent" : "bg-transparent")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", unread ? "font-semibold text-primary" : "font-medium text-primary")}>{n.title}</span>
        <span className="block text-sm text-secondary">{n.body}</span>
      </span>
      <time className="shrink-0 text-xs tabular text-muted" dateTime={n.createdAt}>
        {time}
      </time>
    </>
  );
  const onOpen = async () => {
    if (unread) {
      try {
        await markRead({ ids: [n.id] });
        router.refresh();
      } catch {}
    }
  };
  return (
    <li>
      {n.href ? (
        <Link href={n.href} onClick={onOpen} className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken" aria-label={`${unread ? "Unread: " : ""}${n.title}`}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onOpen} className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken">
          {body}
        </button>
      )}
    </li>
  );
}

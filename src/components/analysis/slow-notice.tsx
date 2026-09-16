"use client";
import Link from "next/link";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";

/** Shown after 90 s without completion. The job keeps running whether the seller stays or leaves. */
export function SlowNotice({ onKeepWaiting, connection }: { onKeepWaiting: () => void; connection: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-sm border border-border-default bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
        <div className="text-sm">
          <p className="font-medium text-primary">This is taking longer than usual.</p>
          <p className="mt-0.5 text-secondary">
            {connection === "reconnecting" ? "Reconnecting to the progress stream. " : ""}
            The analysis keeps running in the background — you can leave and come back from Inventory.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" size="sm" onClick={onKeepWaiting}>
          Keep waiting
        </Button>
        <Link href="/inventory" className={buttonClasses("outline", "sm")}>
          Go to inventory
        </Link>
      </div>
    </div>
  );
}

"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Page } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { EmptyState } from "@/components/ui/card";

/** Error boundary for the review page: says what happened, keeps the route, offers retry. */
export default function ItemError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[items/[id]]", error);
  }, [error]);
  return (
    <Page width="narrow">
      <EmptyState
        icon={<AlertTriangle className="size-6" strokeWidth={1.5} />}
        title="This item couldn't be loaded"
        description={error.message || "Something went wrong on our side. Your photos and data are safe."}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>Try again</Button>
            <Link href="/inventory" className={buttonClasses("outline")}>
              Back to inventory
            </Link>
          </div>
        }
      />
      {error.digest && <p className="mt-4 text-center font-mono text-xs text-muted">Reference {error.digest}</p>}
    </Page>
  );
}

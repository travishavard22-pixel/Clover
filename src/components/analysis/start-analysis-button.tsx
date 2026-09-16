"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { startAnalysis } from "@/components/capture/upload-client";
import { Button } from "@/components/ui/button";

/** Starts (or re-starts) the analysis job for an item and moves to its progress screen. */
export function StartAnalysisButton({ itemId, children = "Start analysis", variant = "primary", size = "md" }: { itemId: string; children?: React.ReactNode; variant?: "primary" | "outline" | "secondary"; size?: "sm" | "md" | "lg" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { jobId } = await startAnalysis(itemId);
          router.replace(`/items/${itemId}/analyzing?job=${encodeURIComponent(jobId)}`);
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "The analysis could not be started");
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}

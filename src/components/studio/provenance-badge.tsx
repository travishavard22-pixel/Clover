"use client";
import Link from "next/link";
import { Info, Sparkles, Wand2, ZoomIn, Eye } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";
import type { RenderPath } from "@/lib/studio/provenance";

const META: Record<RenderPath, { tone: BadgeTone; icon: typeof Sparkles }> = {
  composite: { tone: "info", icon: Sparkles },
  enhance: { tone: "warning", icon: Wand2 },
  detail: { tone: "neutral", icon: ZoomIn },
  condition: { tone: "neutral", icon: Eye },
};

/**
 * The honesty badge for a studio image. "AI background" when a model decided or drew the background;
 * "Enhancement only" (with the reason and a link to provider settings) when it could not.
 */
export function ProvenanceBadge({ path, label, reason, className, showSettingsLink = true }: { path: RenderPath; label: string; reason?: string | null; className?: string; showSettingsLink?: boolean }) {
  const m = META[path];
  const Icon = m.icon;
  const badge = (
    <Badge tone={m.tone} className={cn("backdrop-blur", className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
  if (path !== "enhance") return badge;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Tooltip content={reason ?? "No segmentation provider is configured, so the background could not be separated."}>{badge}</Tooltip>
      {showSettingsLink && (
        <Link href="/settings#providers" className="inline-flex items-center gap-1 rounded-xs text-xs text-secondary underline-offset-4 hover:underline">
          <Info className="size-3" aria-hidden />
          Why? Settings → Providers
        </Link>
      )}
    </span>
  );
}

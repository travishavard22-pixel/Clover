import { cn } from "@/lib/utils/cn";

/** The "Aperture Clover" mark: four aperture-blade leaves around a viewfinder square. */
export function CloverMark({ className, size = 24 }: { className?: string; size?: number }) {
  const showCentre = size > 20;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <g transform="rotate(45 12 12)">
        <path d="M7 2.5h4a1.5 1.5 0 0 1 1.5 1.5v5.5H7A4.5 4.5 0 0 1 7 2.5z" />
        <path d="M17 2.5A4.5 4.5 0 0 1 17 9.5h-5.5V4A1.5 1.5 0 0 1 13 2.5h4z" />
        <path d="M2.5 13h9.5v5.5A1.5 1.5 0 0 1 10.5 20H7a4.5 4.5 0 0 1-4.5-4.5V13z" />
        <path d="M12.5 13H21.5v2.5A4.5 4.5 0 0 1 17 20h-3a1.5 1.5 0 0 1-1.5-1.5V13z" />
        {!showCentre && <rect x="10.75" y="10.75" width="2.5" height="2.5" />}
      </g>
    </svg>
  );
}

export function CloverWordmark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-primary", className)}>
      <CloverMark size={size} className="text-accent" />
      <span className="display font-semibold" style={{ fontSize: size * 0.95, letterSpacing: "-0.035em", lineHeight: 1 }}>
        clover
      </span>
    </span>
  );
}

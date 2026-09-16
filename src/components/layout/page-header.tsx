import { cn } from "@/lib/utils/cn";

/** Standard page header: eyebrow, title, description, actions. Keeps every page's top consistent. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  serif,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  serif?: boolean;
}) {
  return (
    <header className={cn("flex flex-col gap-4 py-6 md:flex-row md:items-end md:justify-between md:py-8", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{eyebrow}</div>}
        <h1 className={cn(serif ? "serif-display text-4xl md:text-5xl" : "display text-2xl md:text-3xl", "text-primary")}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-secondary md:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Page({ children, className, width = "default" }: { children: React.ReactNode; className?: string; width?: "default" | "narrow" | "wide" | "full" }) {
  const w = { default: "max-w-(--content-max)", narrow: "max-w-3xl", wide: "max-w-[1600px]", full: "" }[width];
  return <div className={cn("mx-auto w-full gutter pb-12", w, className)}>{children}</div>;
}

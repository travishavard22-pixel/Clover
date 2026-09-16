import { cn } from "@/lib/utils/cn";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-secondary">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-5", className)}>{children}</div>;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} aria-hidden {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  serif = true,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  serif?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed border-border-default px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 text-muted">{icon}</div>}
      <h3 className={cn(serif ? "serif-display text-3xl" : "text-lg font-semibold", "text-primary")}>{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-secondary">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border-default bg-surface-sunken px-1 font-mono text-[11px] text-secondary">{children}</kbd>;
}

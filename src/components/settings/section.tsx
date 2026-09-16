import { cn } from "@/lib/utils/cn";

/** A settings section: heading + description, then a card of rows. Same markup on every tab. */
export function Section({ id, title, description, children, className }: { id: string; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-20", className)}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-primary">
        {title}
      </h2>
      {description && <p className="mt-1 max-w-2xl text-sm text-secondary">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Rows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("surface-card divide-y divide-border-subtle px-5", className)}>{children}</div>;
}

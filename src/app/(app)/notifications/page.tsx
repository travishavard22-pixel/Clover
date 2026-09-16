import Link from "next/link";
import { Bell } from "lucide-react";
import { Page, PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { dayLabel, listNotifications } from "@/lib/inventory";
import { MarkAllReadButton, NotificationRow } from "@/components/notifications/notification-list";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const page = await listNotifications(user.id, { limit: 60 });
  const groups = new Map<string, typeof page.notifications>();
  for (const n of page.notifications) {
    const label = dayLabel(n.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), n]);
  }
  return (
    <Page width="narrow">
      <PageHeader title="Notifications" description={page.unread > 0 ? `${page.unread} unread` : "You're all caught up."} actions={page.unread > 0 ? <MarkAllReadButton /> : null} />
      {page.notifications.length === 0 ? (
        <EmptyState icon={<Bell className="size-8" />} title="Nothing yet" description="Offers, publishing outcomes and suggestions will show up here." action={<Link className="text-accent-text underline-offset-4 hover:underline" href="/sell">Sell your first item</Link>} />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([label, items]) => (
            <section key={label} aria-labelledby={`day-${label}`}>
              <h2 id={`day-${label}`} className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                {label}
              </h2>
              <ul className="surface-card divide-y divide-border-subtle">
                {items.map((n) => (
                  <NotificationRow key={n.id} n={n} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

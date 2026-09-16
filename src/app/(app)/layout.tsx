import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { db } from "@/lib/db";
import { publicCapabilities } from "@/lib/env";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [prefs, unread] = await Promise.all([
    db.userPreferences.findUnique({ where: { userId: user.id }, select: { onboardingComplete: true } }),
    db.offer.count({ where: { userId: user.id, status: "PENDING" } }),
  ]);
  if (!prefs?.onboardingComplete) redirect("/onboarding");
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, image: user.image }} capabilities={publicCapabilities()} unread={unread}>
      {children}
    </AppShell>
  );
}

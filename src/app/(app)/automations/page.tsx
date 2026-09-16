import type { Metadata } from "next";
import { AutomationsCenter } from "@/components/automations/automations-center";
import { AUTOMATION_LIST, getRulesForUser } from "@/lib/automations";
import { lastRunForUser, listRecommendations, recentActivityByType } from "@/lib/automations/recommendations";
import { capabilities } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Automations" };
export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const user = await requireUser();
  const [rules, activity, recommendations, lastRun] = await Promise.all([getRulesForUser(user.id), recentActivityByType(user.id), listRecommendations(user.id, { status: ["OPEN", "SNOOZED"] }), lastRunForUser(user.id)]);
  return <AutomationsCenter registry={AUTOMATION_LIST} rules={rules} activity={activity} recommendations={recommendations} lastRun={lastRun} demo={capabilities.demoMode || !capabilities.ai} />;
}

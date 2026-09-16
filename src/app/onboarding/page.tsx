import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { capabilities } from "@/lib/env";
import { getOnboardingState, resolveStep } from "@/lib/onboarding";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const user = await requireUser();
  const [q, state] = await Promise.all([searchParams, getOnboardingState(user.id)]);
  const step = resolveStep(q.step, state.step);
  return <OnboardingFlow state={state} initialStep={step} firstName={user.name.split(" ")[0] || user.name} demo={capabilities.demoMode || !capabilities.ai} />;
}

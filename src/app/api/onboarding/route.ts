import { json, parseBody, withUser } from "@/lib/api";
import { requestMeta } from "@/lib/audit";
import { getOnboardingState, OnboardingPutSchema, updateOnboarding } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/** GET /api/onboarding → OnboardingState */
export const GET = withUser(async (_req, { user }) => json(await getOnboardingState(user.id)));

/** PUT /api/onboarding `{ step?, prefs?, complete? }` → OnboardingState */
export const PUT = withUser(async (req, { user }) => {
  const body = await parseBody(req, OnboardingPutSchema);
  return json(await updateOnboarding(user.id, body, requestMeta(req)));
});

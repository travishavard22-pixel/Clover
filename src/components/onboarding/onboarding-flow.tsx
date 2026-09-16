"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import type { OnboardingState } from "@/lib/onboarding";
import { LAST_STEP, ONBOARDING_STEPS } from "@/lib/onboarding/steps";
import type { PreferencesPatch } from "@/lib/settings/schema";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";
import { apiRequest, errorMessage } from "@/lib/client/request";
import { ProgressDots } from "./progress-dots";
import { StepConnect, StepFirstItem, StepHowItWorks, StepLocation, StepNotifications, StepPricing, StepSelling, StepWelcome, type Draft } from "./steps";

const STEP_LABELS = ONBOARDING_STEPS.map((s) => s.title);

/** Which preference keys each step owns — only those are saved when the step is left. */
const STEP_KEYS: Partial<Record<number, (keyof Draft)[]>> = {
  3: ["defaultMarketplaces", "offersShipping", "offersLocalPickup", "defaultShippingNote"],
  4: ["city", "region", "postalCode"],
  5: ["pricingStrategy"],
  6: ["notifyOffers", "notifyStale", "notifyPublishing", "notifyEmail"],
};

function draftFrom(p: OnboardingState["preferences"]): Draft {
  return {
    defaultMarketplaces: p.defaultMarketplaces as Draft["defaultMarketplaces"],
    offersShipping: p.offersShipping,
    offersLocalPickup: p.offersLocalPickup,
    defaultShippingNote: p.defaultShippingNote,
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    pricingStrategy: p.pricingStrategy,
    notifyOffers: p.notifyOffers,
    notifyStale: p.notifyStale,
    notifyPublishing: p.notifyPublishing,
    notifyEmail: p.notifyEmail,
  };
}

/**
 * One question per screen. Progress is persisted after every move so the flow resumes where the
 * seller left it; `?step=` in the URL lets Connections send them back to the right screen.
 */
export function OnboardingFlow({ state, initialStep, firstName, demo }: { state: OnboardingState; initialStep: number; firstName: string; demo: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(state.preferences));
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value })), []);

  useEffect(() => {
    const url = `/onboarding?step=${ONBOARDING_STEPS[step]!.slug}`;
    window.history.replaceState(window.history.state, "", url);
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const persist = async (next: number, keys: (keyof Draft)[] | undefined) => {
    const prefs: PreferencesPatch | undefined = keys ? (Object.fromEntries(keys.map((k) => [k, draft[k]])) as PreferencesPatch) : undefined;
    if (prefs && prefs.offersShipping === false && prefs.offersLocalPickup === false) {
      toast.error("Keep shipping or local pickup on so buyers can receive the item.");
      return false;
    }
    setSaving(true);
    try {
      await apiRequest("/api/onboarding", { method: "PUT", json: { step: next, ...(prefs ? { prefs } : {}) } });
      return true;
    } catch (err) {
      toast.error(errorMessage(err, "Could not save your answer. Your entries are kept — try again."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const go = async (next: number, opts: { save?: boolean } = { save: true }) => {
    const target = Math.min(LAST_STEP, Math.max(0, next));
    if (target === step) return;
    const ok = await persist(target, opts.save ? STEP_KEYS[step] : undefined);
    if (!ok) return;
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  const finish = async (href: string) => {
    setFinishing(true);
    try {
      await apiRequest("/api/onboarding", { method: "PUT", json: { complete: true, step: LAST_STEP } });
      router.push(href);
    } catch (err) {
      toast.error(errorMessage(err, "Could not finish setup. Try again."));
      setFinishing(false);
    }
  };

  const isLast = step === LAST_STEP;
  const distance = reduce || keyboard.current ? 0 : 24;
  const variants = {
    enter: (d: 1 | -1) => ({ opacity: 0, x: d * distance }),
    center: { opacity: 1, x: 0 },
    exit: (d: 1 | -1) => ({ opacity: 0, x: -d * distance }),
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gutter pb-8" onKeyDownCapture={(e) => (keyboard.current = e.key === "Enter" || e.key === " ")} onPointerDownCapture={() => (keyboard.current = false)}>
      <div className="flex items-center justify-between py-4">
        <ProgressDots count={ONBOARDING_STEPS.length} current={step} labels={STEP_LABELS} onJump={(i) => void go(i)} />
        {demo && <DemoBadge />}
      </div>

      <div className="relative flex-1 overflow-hidden py-6" role="group" aria-roledescription="onboarding step" aria-label={`${STEP_LABELS[step]}, step ${step + 1} of ${ONBOARDING_STEPS.length}`}>
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.15 : 0.24, ease: [0.23, 1, 0.32, 1] }}
            ref={headingRef}
            tabIndex={-1}
            className="outline-none"
          >
            {step === 0 && <StepWelcome firstName={firstName} />}
            {step === 1 && <StepHowItWorks />}
            {step === 2 && <StepConnect connections={state.connections} returnTo="/onboarding?step=connect" demo={demo} />}
            {step === 3 && <StepSelling draft={draft} set={set} />}
            {step === 4 && <StepLocation draft={draft} set={set} />}
            {step === 5 && <StepPricing draft={draft} set={set} />}
            {step === 6 && <StepNotifications draft={draft} set={set} />}
            {step === 7 && <StepFirstItem onFinish={() => void finish("/sell")} finishing={finishing} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <div>
          {step > 0 && (
            <Button variant="ghost" onClick={() => void go(step - 1)} disabled={saving} leadingIcon={<ArrowLeft className="size-4" aria-hidden />}>
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isLast && (
            <Button variant="ghost" onClick={() => void go(step + 1, { save: false })} disabled={saving}>
              Skip
            </Button>
          )}
          {!isLast ? (
            <Button onClick={() => void go(step + 1)} loading={saving} trailingIcon={<ArrowRight className="size-4" aria-hidden />}>
              {step === 0 ? "Let's start" : "Continue"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void finish("/home")} disabled={finishing}>
              Go to Home instead
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

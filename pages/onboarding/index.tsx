// pages/onboarding/index.tsx — the mandatory wizard shell. A full page, not a dialog: there's no
// dashboard worth keeping visible behind it yet, and the nav rail in components/Layout.tsx has
// nothing meaningful to link to pre-onboarding.
//
// Step state lives client-side (like Settings' own section state) rather than as sub-routes, so
// "can't skip a step" is just "don't render the next one until this one succeeds." Resume-on-
// reload is derived from already-persisted data (/api/onboarding/status), not a stored step number.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import StepKey from "@/components/onboarding/StepKey";
import StepScrape, { type ScrapedProfile } from "@/components/onboarding/StepScrape";
import StepProfile from "@/components/onboarding/StepProfile";
import StepEngines from "@/components/onboarding/StepEngines";
import StepPrompts from "@/components/onboarding/StepPrompts";
import StepConfirmRun from "@/components/onboarding/StepConfirmRun";

const TOTAL_STEPS = 6;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState<number | null>(null); // null while resuming
  const [draft, setDraft] = useState<ScrapedProfile | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => r.json())
      .then((s) => {
        if (!s.hasOpenRouterKey) return setStep(1);
        if (!s.hasSelfBrand) return setStep(2);
        if (!s.selectedVendorCount) return setStep(4);
        if (!s.promptCount) return setStep(5);
        if (!s.completed) return setStep(6);
        // Fully done (e.g. onboarded from another tab) — nothing left to do here.
        router.replace("/");
      })
      .catch(() => setStep(1));
  }, [router]);

  if (step === null) return null;

  // Steps 1/2/4/6 are a single narrow form, matching the login page's centered-panel width.
  // Steps 3 (form + live preview) and 5 (topic list) need real room to breathe.
  const WIDE_STEPS = new Set([3, 5]);
  const maxWidth = WIDE_STEPS.has(step) ? "max-w-3xl" : "max-w-md";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className={`w-full ${maxWidth}`}>
        <div className="mb-8 flex items-center gap-2">
          <Image src="/logo.png" alt="Habibi" width={28} height={28} className="rounded-md" />
          <span className="text-base font-semibold tracking-tight">Habibi</span>
        </div>

        <div className="mb-6">
          <div className="text-xs font-medium text-faint">
            STEP {step}/{TOTAL_STEPS}
          </div>
        </div>

        {step === 1 && <StepKey onDone={() => setStep(2)} />}
        {step === 2 && (
          <StepScrape
            onDone={(profile) => {
              setDraft(profile);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <StepProfile
            draft={draft}
            onBack={() => setStep(2)}
            onDone={() => setStep(4)}
          />
        )}
        {step === 4 && <StepEngines onBack={() => setStep(3)} onDone={() => setStep(5)} />}
        {step === 5 && <StepPrompts onBack={() => setStep(4)} onDone={() => setStep(6)} />}
        {step === 6 && <StepConfirmRun onDone={() => router.push("/")} />}
      </div>
    </div>
  );
}

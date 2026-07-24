// lib/premium.ts — the ONE bridge from open-core code to commercial (ee/) features.
//
// This file lives in open-core and is present in BOTH the private and public builds.
// It loads ee/ if the folder exists, otherwise degrades to `null`. Open-core code must
// call premium features ONLY through the `premium` object exported here — never with a
// direct `import ... from "@/ee/..."` anywhere else. That one rule is what makes the
// public build (ee/ stripped) compile and run with premium cleanly absent.
//
// Full strategy + rules: docs/OPEN_CORE.md
//
// IMPORTANT: the surface types below are declared HERE, in open-core, on purpose. If we
// imported them from @/ee, the public build (where @/ee does not exist) would fail to
// typecheck. ee/index.ts must SATISFY this type instead. Extend this as features land.
//
// The surfaces below are the PLANNED paid features (see docs/ROADMAP.md). None ship in
// V1 — V1 is fully open-core. They are declared here so the seam is ready; add a field
// only when open-core actually reads it, and keep the boundary types loose (any/null) so
// the richer ee/ types stay assignable.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Google AI Overviews / AI Mode engine (DataForSEO SERP scrape — no public API). */
export interface OverviewSurface {
  // Runs one prompt against Google AI Overviews and returns the same shape as a normal
  // engine adapter: answer text + cited URLs + cost.
  run(prompt: string): Promise<{
    text: string;
    citations: { url: string; domain: string }[];
    costUsd: number;
  }>;
}

/** Threshold alerts (visibility drop, competitor overtook you). */
export interface AlertsSurface {
  // Evaluate a freshly-stored run against configured thresholds; dispatch if breached.
  evaluate(runId: string): Promise<void>;
}

/** Scheduled email/Slack reports (managed-cloud convenience). */
export interface ReportsSurface {
  sendScheduled(): Promise<void>;
}

export interface PremiumSurface {
  overview?: OverviewSurface;
  alerts?: AlertsSurface;
  reports?: ReportsSurface;
  [key: string]: unknown;
}

function loadPremium(): PremiumSurface | null {
  try {
    // Loaded by real path. The ee/ folder is imported IN PLACE (not copied) so its own
    // relative imports resolve normally. In the public build this require throws → null.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/ee");
    return (mod?.default ?? mod) as PremiumSurface;
  } catch {
    return null; // public build: ee/ has been stripped
  }
}

export const premium: PremiumSurface | null = loadPremium();

/** True in the private/commercial build, false in the public open-source build. */
export const hasPremium: boolean = premium !== null;

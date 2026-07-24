// One call that returns everything the three dashboard views need. Kept simple: the UI reads
// `days` from the query (default 30) and renders. All queries live in lib/data.ts.
import type { NextApiRequest, NextApiResponse } from "next";
import {
  visibilityByEngine,
  shareOfVoice,
  visibilityTrend,
  promptEngineRates,
  selfCitations,
  listPrompts,
  listBrands,
  spendToday,
  recentFailures,
} from "@/lib/data";
import { activeEngines } from "@/lib/engines";
import { extractionStatus } from "@/lib/extract";
import { isRunning } from "@/lib/runner";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const days = Math.max(1, parseInt((req.query.days as string) ?? "30", 10) || 30);
  const engineIds = activeEngines().map((e) => e.id);
  const extraction = extractionStatus();

  res.status(200).json({
    days,
    engines: engineIds,
    running: isRunning(),
    spendToday: spendToday(),
    prompts: listPrompts(),
    failures: recentFailures(engineIds),
    // Mention extraction needs a self brand; without one a "successful" run yields no data.
    hasSelfBrand: listBrands().some((b) => b.is_self),
    // Without an extraction provider, runs succeed but visibility is permanently 0%.
    extractionReady: extraction.ready,
    visibilityByEngine: visibilityByEngine(days),
    shareOfVoice: shareOfVoice(days),
    visibilityTrend: visibilityTrend(days),
    promptEngineRates: promptEngineRates(days),
    selfCitations: selfCitations(days),
  });
}

// pages/api/onboarding/complete.ts — finish the wizard. Instance-level, not per-user: this app
// is single-tenant (every login shares the same brand/prompts/providers), so completing
// onboarding once means every account lands on the dashboard from then on.
//
// Does NOT start a run — the wizard's confirm-run step asks the user first and shows the cost,
// then calls the existing /api/run-now itself if they say yes.
import type { NextApiRequest, NextApiResponse } from "next";
import { setSetting } from "@/lib/data";

export const ONBOARDING_COMPLETE_KEY = "onboarding_complete_at";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  setSetting(ONBOARDING_COMPLETE_KEY, new Date().toISOString());
  return res.status(200).json({ ok: true });
}

// pages/api/onboarding/status.ts — lets the wizard resume mid-flow after a reload, derived from
// data already persisted at each step rather than a stored "current step" column.
import type { NextApiRequest, NextApiResponse } from "next";
import { isProviderConfigured, selectedModels } from "@/lib/providers";
import { getSelfBrand, listPrompts, getSetting } from "@/lib/data";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const hasOpenRouterKey = isProviderConfigured("openrouter");
  const selfBrand = getSelfBrand();
  const selectedVendorCount = selectedModels("openrouter").length;
  const promptCount = listPrompts().length;
  const completed = !!getSetting("onboarding_complete_at");

  return res.status(200).json({
    hasOpenRouterKey,
    hasSelfBrand: !!selfBrand,
    selectedVendorCount,
    promptCount,
    completed,
  });
}

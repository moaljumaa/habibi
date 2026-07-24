// pages/api/vendor-models.ts — the 4 recognizable engines shown in onboarding and Settings:
// ChatGPT, Claude, Gemini, Perplexity. Each resolves to that vendor's newest model in the live
// OpenRouter catalogue (pages/api/openrouter-models.ts, already sorted newest-first per vendor) —
// no model IDs for the user to choose between, just a toggle per vendor.
import type { NextApiRequest, NextApiResponse } from "next";
import { getCatalogue } from "./openrouter-models";

export interface VendorOption {
  id: string;
  label: string;
  model: string | null;
}

const VENDORS: { id: string; label: string }[] = [
  { id: "openai", label: "ChatGPT" },
  { id: "anthropic", label: "Claude" },
  { id: "google", label: "Gemini" },
  { id: "perplexity", label: "Perplexity" },
];

// Pinned default per vendor, used instead of "whatever's newest" — chosen deliberately rather
// than auto-resolved, since the catalogue's newest release isn't always the one we want tracked
// by default. Falls back to the auto-resolved latest if the pinned id isn't in the live catalogue
// (e.g. retired later).
const PINNED_DEFAULT: Record<string, string> = {
  openai: "openai/gpt-5.3-chat",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const groups = await getCatalogue();
    const byVendor = new Map(groups.map((g) => [g.provider, g.models]));

    const vendors: VendorOption[] = VENDORS.map((v) => {
      const models = byVendor.get(v.id) ?? [];
      const pinned = PINNED_DEFAULT[v.id];
      const pinnedAvailable = pinned && models.some((m) => m.id === pinned);
      if (pinnedAvailable) return { id: v.id, label: v.label, model: pinned };

      // Catalogue is already newest-first per vendor; skip anything clearly retired.
      const latest = models.find((m) => !/preview|deprecated/i.test(m.id)) ?? models[0];
      return { id: v.id, label: v.label, model: latest?.id ?? null };
    });

    return res.status(200).json({ vendors });
  } catch (err) {
    return res
      .status(502)
      .json({ error: `Could not load models: ${err instanceof Error ? err.message : err}` });
  }
}

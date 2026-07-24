// pages/api/onboarding/suggest-prompts.ts — step 5 draft. Actual persistence happens through
// the existing POST /api/prompts, called by the client once per accepted prompt.
import type { NextApiRequest, NextApiResponse } from "next";
import { getSelfBrand } from "@/lib/data";
import { suggestPrompts } from "@/lib/promptSuggestions";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const brand = getSelfBrand();
  if (!brand) return res.status(400).json({ error: "No brand set up yet.", topics: [] });

  const topics = await suggestPrompts(brand);
  return res.status(200).json({ topics });
}

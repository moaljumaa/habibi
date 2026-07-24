// pages/api/onboarding/scrape-brand.ts — step 2 of the wizard: render the user's site, draft a
// brand profile from it. Failures are specific and never fatal — the client offers a "skip and
// fill in manually" path for any of them.
import type { NextApiRequest, NextApiResponse } from "next";
import { isProviderConfigured } from "@/lib/providers";
import { scrapeVisibleText } from "@/lib/scrape";
import { draftBrandProfile, type DraftedBrandProfile } from "@/lib/brandProfile";

interface Ok {
  ok: true;
  profile: DraftedBrandProfile;
}
interface Fail {
  ok: false;
  error: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Ok | Fail>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  if (!isProviderConfigured("openrouter")) {
    return res.status(400).json({ ok: false, error: "Add an OpenRouter key first." });
  }

  const url = (req.body?.url ?? "").trim();
  if (!url) return res.status(400).json({ ok: false, error: "Enter a URL." });

  let text: string;
  try {
    text = await scrapeVisibleText(url);
  } catch (err) {
    return res
      .status(200)
      .json({ ok: false, error: err instanceof Error ? err.message : "Couldn't load that site." });
  }

  try {
    const profile = await draftBrandProfile(url, text);
    return res.status(200).json({ ok: true, profile });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't draft a brand profile.",
    });
  }
}

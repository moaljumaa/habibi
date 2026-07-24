// pages/api/onboarding/validate-key.ts — the wizard's gate. A key is only stored once it's
// proven to work; a bad key never reaches lib/providers.ts.
import type { NextApiRequest, NextApiResponse } from "next";
import { saveProvider } from "@/lib/providers";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const apiKey = (req.body?.apiKey ?? "").trim();
  if (!apiKey) return res.status(400).json({ ok: false, error: "Enter an API key." });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res2 = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res2.ok) {
      const msg =
        res2.status === 401
          ? "That key was rejected by OpenRouter. Check it and try again."
          : `OpenRouter returned ${res2.status}. Try again.`;
      return res.status(200).json({ ok: false, error: msg });
    }

    saveProvider("openrouter", { apiKey });
    return res.status(200).json({ ok: true });
  } catch (err) {
    clearTimeout(timeout);
    const timedOut = err instanceof Error && err.name === "AbortError";
    return res.status(200).json({
      ok: false,
      error: timedOut ? "OpenRouter didn't respond in time. Try again." : "Couldn't reach OpenRouter.",
    });
  }
}

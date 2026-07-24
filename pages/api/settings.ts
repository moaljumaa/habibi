import type { NextApiRequest, NextApiResponse } from "next";
import { getNumberSetting, setSetting } from "@/lib/data";

const KEYS = ["samples_per_prompt", "daily_spend_cap_usd"] as const;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json({
      samples_per_prompt: getNumberSetting(
        "samples_per_prompt",
        parseInt(process.env.SAMPLES_PER_PROMPT ?? "1", 10) || 1
      ),
      daily_spend_cap_usd: getNumberSetting(
        "daily_spend_cap_usd",
        parseFloat(process.env.DAILY_SPEND_CAP_USD ?? "5") || 5
      ),
    });
  }
  if (req.method === "POST") {
    for (const key of KEYS) {
      const v = req.body?.[key];
      if (v != null && Number.isFinite(Number(v))) setSetting(key, String(Number(v)));
    }
    return res.status(200).json({ ok: true });
  }
  res.setHeader("Allow", "GET, POST");
  res.status(405).end();
}

// What a run costs, priced from this install's own history.
//
// Takes `samples` from the query so Settings can show the estimate updating as the user drags
// the number — the decision and its price sit on the same screen.
import type { NextApiRequest, NextApiResponse } from "next";
import { estimateCost, listPrompts, getNumberSetting } from "@/lib/data";
import { activeEngines } from "@/lib/engines";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const engines = activeEngines().map((e) => e.id);
  const prompts = listPrompts(true).length;

  const requested = parseInt((req.query.samples as string) ?? "", 10);
  const samples = Number.isFinite(requested)
    ? Math.max(1, requested)
    : Math.max(
        1,
        getNumberSetting("samples_per_prompt", parseInt(process.env.SAMPLES_PER_PROMPT ?? "1", 10) || 1)
      );

  res.status(200).json(estimateCost(engines, prompts, samples));
}

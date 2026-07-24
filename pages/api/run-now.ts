// Kick off a full tracking run on demand. Fire-and-forget: returns immediately with 202 while
// the run proceeds in the background (a run can take a while across prompts × engines × samples).
import type { NextApiRequest, NextApiResponse } from "next";
import { runAll, isRunning } from "@/lib/runner";
import { activeEngines } from "@/lib/engines";
import { listPrompts } from "@/lib/data";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (isRunning()) {
    return res.status(409).json({ error: "A run is already in progress" });
  }
  if (activeEngines().length === 0) {
    return res.status(400).json({ error: "No engines configured — add an API key in .env" });
  }
  if (listPrompts(true).length === 0) {
    return res.status(400).json({ error: "No active prompts to run" });
  }

  // Don't await — let it run in the background; report start.
  runAll().catch((err) => console.error("[run-now] run failed:", err));
  res.status(202).json({ started: true });
}

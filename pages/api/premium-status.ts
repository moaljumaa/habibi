// Open-core endpoint: tells the UI whether premium (ee/) is present, so it can render real
// premium controls vs. "Upgrade" stubs. Returns false in the public build. See docs/OPEN_CORE.md.
import type { NextApiRequest, NextApiResponse } from "next";
import { hasPremium } from "@/lib/premium";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ hasPremium });
}

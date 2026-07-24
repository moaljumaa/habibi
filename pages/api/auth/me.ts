// pages/api/auth/me.ts — re-verifies the session itself rather than assuming middleware
// already guaranteed a valid caller; this route must be safe to call from anywhere.
import type { NextApiRequest, NextApiResponse } from "next";
import { userFromRequest } from "@/lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  return res.status(200).json({ email: user.email });
}

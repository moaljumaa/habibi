// pages/api/auth/login.ts — "no such user" and "wrong password" get the identical error so a
// caller can't use this endpoint to enumerate which emails have accounts.
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyCredentials, setSessionCookie } from "@/lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "invalid email or password" });
  }

  const user = verifyCredentials(email, password);
  if (!user) {
    return res.status(401).json({ error: "invalid email or password" });
  }

  res.setHeader("Set-Cookie", setSessionCookie(user.id));
  return res.status(200).json({ ok: true });
}

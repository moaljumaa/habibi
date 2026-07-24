// pages/api/auth/signup.ts — creates a new account, gated by HABIBI_SIGNUP_SECRET rather
// than "is this the first account" — anyone who knows the secret can sign up, any time.
import type { NextApiRequest, NextApiResponse } from "next";
import { verifySignupSecret, findUserByEmail, createUser, setSessionCookie } from "@/lib/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const { email, password, secret } = req.body ?? {};
  if (typeof secret !== "string" || !verifySignupSecret(secret)) {
    return res.status(401).json({ error: "invalid signup secret" });
  }
  if (typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: "an account with that email already exists" });
  }

  const user = createUser(email, password);
  res.setHeader("Set-Cookie", setSessionCookie(user.id));
  return res.status(200).json({ ok: true });
}

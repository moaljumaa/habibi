// The answers behind one prompt — what each engine actually said, cited, and named.
import type { NextApiRequest, NextApiResponse } from "next";
import { promptDetail } from "@/lib/data";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: "missing id" });

  const detail = promptDetail(id);
  if (!detail.prompt) return res.status(404).json({ error: "prompt not found" });

  res.status(200).json(detail);
}

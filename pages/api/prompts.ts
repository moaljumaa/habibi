import type { NextApiRequest, NextApiResponse } from "next";
import { listPrompts, createPrompt, setPromptActive, deletePrompt } from "@/lib/data";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json(listPrompts());
  }
  if (req.method === "POST") {
    const { text, tags } = req.body ?? {};
    if (!text?.trim()) return res.status(400).json({ error: "text required" });
    const t = Array.isArray(tags) ? tags.map((x: string) => x.trim()).filter(Boolean) : [];
    return res.status(201).json(createPrompt(text.trim(), t));
  }
  if (req.method === "PATCH") {
    const { id, active } = req.body ?? {};
    if (!id) return res.status(400).json({ error: "id required" });
    setPromptActive(id, !!active);
    return res.status(200).json({ ok: true });
  }
  if (req.method === "DELETE") {
    const { id } = req.body ?? {};
    if (!id) return res.status(400).json({ error: "id required" });
    deletePrompt(id);
    return res.status(204).end();
  }
  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  res.status(405).end();
}

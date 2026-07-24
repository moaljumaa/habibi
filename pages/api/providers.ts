// pages/api/providers.ts — read/write provider credentials.
//
// GET never returns key material: describeProviders() yields a masked hint only. There is
// deliberately no endpoint that reads a stored key back out — once saved, a key is write-only
// from the UI's point of view.
import type { NextApiRequest, NextApiResponse } from "next";
import {
  describeProviders,
  saveProvider,
  deleteProviderKey,
  setSelectedModels,
  isKnownProvider,
} from "@/lib/providers";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(200).json(describeProviders());
  }

  if (req.method === "POST") {
    const { id, api_key, model, models, enabled } = req.body ?? {};
    if (!isKnownProvider(id)) {
      return res.status(400).json({ error: "unknown provider" });
    }
    try {
      if (Array.isArray(models)) setSelectedModels(id, models);
      saveProvider(id, {
        apiKey: typeof api_key === "string" ? api_key : undefined,
        model: model === undefined ? undefined : model,
        enabled: typeof enabled === "boolean" ? enabled : undefined,
      });
    } catch (err) {
      return res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
    }
    return res.status(200).json({ ok: true, providers: describeProviders() });
  }

  if (req.method === "DELETE") {
    const { id } = req.body ?? {};
    if (!isKnownProvider(id)) {
      return res.status(400).json({ error: "unknown provider" });
    }
    deleteProviderKey(id);
    return res.status(200).json({ ok: true, providers: describeProviders() });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).end();
}

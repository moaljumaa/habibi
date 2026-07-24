// pages/api/openrouter-models.ts — the live OpenRouter catalogue, grouped by provider.
//
// Fetched fresh rather than hardcoded: model ids churn constantly and a stale hardcoded list
// is how you end up tracking a model that was retired months ago. Cached in memory for an
// hour so opening Settings doesn't hammer the endpoint.
import type { NextApiRequest, NextApiResponse } from "next";

const CACHE_MS = 60 * 60 * 1000;

export interface CatalogueModel {
  id: string;
  name: string;
  /** Per-request cost of native web search, if the model supports it. null = Exa fallback. */
  webSearchUsd: number | null;
  created: number;
}

export interface CatalogueGroup {
  provider: string;
  models: CatalogueModel[];
}

let cache: { at: number; groups: CatalogueGroup[] } | null = null;

// Providers whose models are what people actually mean by "AI search". Everything else is
// still selectable, just sorted below these.
const PRIORITY = ["openai", "anthropic", "google", "perplexity", "x-ai", "deepseek", "mistralai"];

/**
 * Fetch + group the live catalogue, cached in memory for an hour. Exported so other endpoints
 * (pages/api/vendor-models.ts) that need "the latest model per vendor" share this one fetch/cache
 * instead of hitting OpenRouter separately.
 */
export async function getCatalogue(forceRefresh = false): Promise<CatalogueGroup[]> {
  if (cache && Date.now() - cache.at < CACHE_MS && !forceRefresh) {
    return cache.groups;
  }

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/models");
    if (!upstream.ok) throw new Error(`OpenRouter ${upstream.status}`);
    const body = await upstream.json();

    const byProvider = new Map<string, CatalogueModel[]>();
    for (const m of body.data ?? []) {
      if (typeof m?.id !== "string" || !m.id.includes("/")) continue;
      const provider = m.id.split("/")[0];
      const webSearch = m.pricing?.web_search;
      const list = byProvider.get(provider) ?? [];
      list.push({
        id: m.id,
        name: m.name ?? m.id,
        webSearchUsd: webSearch != null ? Number(webSearch) : null,
        created: m.created ?? 0,
      });
      byProvider.set(provider, list);
    }

    const groups: CatalogueGroup[] = [...byProvider.entries()]
      .map(([provider, models]) => ({
        provider,
        // Newest first — the model you want is almost always the one just released.
        models: models.sort((a, b) => b.created - a.created),
      }))
      .sort((a, b) => {
        const ia = PRIORITY.indexOf(a.provider);
        const ib = PRIORITY.indexOf(b.provider);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.provider.localeCompare(b.provider);
      });

    cache = { at: Date.now(), groups };
    return groups;
  } catch (err) {
    // Serve a stale cache over an error — a picker with old options beats a broken page.
    if (cache) return cache.groups;
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const forceRefresh = req.query.refresh === "1";
  const hadCache = !!cache;
  try {
    const groups = await getCatalogue(forceRefresh);
    const stale = hadCache && cache !== null && Date.now() - cache.at >= CACHE_MS;
    return res.status(200).json({ groups, cached: hadCache && !forceRefresh, stale });
  } catch (err) {
    return res
      .status(502)
      .json({ error: `Could not load models: ${err instanceof Error ? err.message : err}` });
  }
}

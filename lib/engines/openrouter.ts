// lib/engines/openrouter.ts — OpenRouter adapter.
//
// One key, many models. Each model the user selects in Settings becomes its OWN engine
// ("openrouter:anthropic/claude-sonnet-5"), so a single key can track ChatGPT, Claude, Gemini
// and Perplexity side by side in the same dashboard.
//
// The `web` plugin grounds any model: models with native search use their own, the rest fall
// back to Exa. Either way the response carries url_citation annotations.
// Docs: https://openrouter.ai/docs/guides/features/plugins/web-search
import { EngineAdapter, EngineResult, domainOf } from "./types";
import { providerKey, providerModel, selectedModels, isProviderConfigured } from "../providers";

export const OPENROUTER_PREFIX = "openrouter:";
const DEFAULT_MODEL = "openai/gpt-5.2";
const MAX_RESULTS = 5;

/** The model id behind an engine id, e.g. "openrouter:openai/gpt-5.2" → "openai/gpt-5.2". */
export function modelOfEngine(engineId: string): string | null {
  return engineId.startsWith(OPENROUTER_PREFIX)
    ? engineId.slice(OPENROUTER_PREFIX.length)
    : null;
}

function makeEngine(model: string): EngineAdapter {
  return {
    id: `${OPENROUTER_PREFIX}${model}`,
    isConfigured: () => isProviderConfigured("openrouter"),
    run: (prompt: string) => runOpenrouter(prompt, model),
  };
}

/**
 * One adapter per selected model. Falls back to the single `model` column (then a default) so
 * a key with no explicit selection still tracks something.
 */
export function openrouterEngines(): EngineAdapter[] {
  if (!isProviderConfigured("openrouter")) return [];
  const models = selectedModels("openrouter");
  if (models.length) return models.map(makeEngine);
  return [makeEngine(providerModel("openrouter", DEFAULT_MODEL))];
}

async function runOpenrouter(prompt: string, model: string): Promise<EngineResult> {
  const key = providerKey("openrouter");
  if (!key) throw new Error("OpenRouter: no API key configured");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      plugins: [{ id: "web", max_results: MAX_RESULTS }],
      // Return the exact billed cost on this response. The /generation endpoint reports the
      // same number but only becomes available ~4s later, which is useless in a run loop.
      usage: { include: true },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message ?? {};
  const text: string = message.content ?? "";

  const urls: string[] = [];
  for (const ann of message.annotations ?? []) {
    const url = ann?.url_citation?.url;
    if (ann?.type === "url_citation" && url) urls.push(url);
  }

  const citations = dedupe(urls).map((url) => ({ url, domain: domainOf(url) }));

  // Real billed cost, not an estimate — includes the web-search fee.
  const costUsd = typeof data.usage?.cost === "number" ? data.usage.cost : 0;

  return { text, citations, costUsd };
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

// lib/engines/index.ts — registry of open-core engine adapters.
// Only engines with a configured API key are active; the runner skips the rest.
// (Google AI Overviews is a PAID engine — it lives in ee/ and is reached via premium.overview,
//  never registered here. See docs/OPEN_CORE.md.)
import { EngineAdapter } from "./types";
import { perplexity } from "./perplexity";
import { openai } from "./openai";
import { gemini } from "./gemini";
import { openrouterEngines } from "./openrouter";

/** Fixed, one-model-each adapters hitting a provider's own API directly. */
export const DIRECT_ENGINES: EngineAdapter[] = [perplexity, openai, gemini];

/**
 * The engines a run will actually hit: direct adapters with a key, plus one engine per model
 * selected on OpenRouter (that list is dynamic, so it's resolved per call, not at module load).
 */
export function activeEngines(): EngineAdapter[] {
  return [...DIRECT_ENGINES.filter((e) => e.isConfigured()), ...openrouterEngines()];
}

export * from "./types";

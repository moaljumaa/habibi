// lib/engines/types.ts — the one contract every engine adapter implements.
//
// The hard requirement is GROUNDING: a raw LLM call returns no citations, so there's nothing
// to track. Each adapter must hit a search-grounded endpoint and return the cited source URLs
// from the API's own metadata (deterministic — no LLM guessing). See docs/ARCHITECTURE.md.
//
// OpenRouter counts: its web plugin grounds ANY model and returns url_citation annotations,
// so one key covers many engines. Direct adapters stay for engines we want first-party.

// Engine ids are open-ended: a multi-model provider mints one per selected model, e.g.
// "openrouter:anthropic/claude-sonnet-5". The direct adapters keep their plain ids.
export type EngineId = string;

export const DIRECT_ENGINE_IDS = ["perplexity", "openai", "gemini"] as const;

export interface EngineCitation {
  url: string;
  domain: string;
}

export interface EngineResult {
  text: string;                  // the model's answer
  citations: EngineCitation[];   // cited sources, straight from API metadata
  costUsd: number;               // estimated cost of this call, for the spend guardrail
}

export interface EngineAdapter {
  id: EngineId;
  /** True when the required API key is present; absent-key engines are skipped by the runner. */
  isConfigured(): boolean;
  run(prompt: string): Promise<EngineResult>;
}

/** Extract a bare hostname (no www.) from a URL, for citation grouping. Returns "" if unparseable. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

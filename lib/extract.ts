// lib/extract.ts — turn a raw engine answer into structured mentions.
//
// Two layers (see docs/ARCHITECTURE.md):
//   1. Citations are DETERMINISTIC — they come straight from the engine's API metadata
//      (handled in the adapters), so no LLM is needed and it's free/accurate. The runner
//      stores those directly.
//   2. Brand MENTIONS need one cheap LLM call: "which of these known brands are named in
//      this answer, and in what order?" We keep the model small (EXTRACTION_MODEL) and the
//      output strictly JSON.

import { providerKey } from "./providers";

export interface KnownBrand {
  id: string;
  name: string;
}

export interface ExtractedMention {
  brand_id: string;
  position: number | null; // 1-based order of first appearance, if determinable
}

// Rough per-1k rates for the small default models. Only feeds the spend guardrail.
const USD_PER_1K_INPUT = 0.00015;
const USD_PER_1K_OUTPUT = 0.0006;

export interface MentionExtraction {
  mentions: ExtractedMention[];
  costUsd: number;
}

export interface Extractor {
  url: string;
  key: string;
  model: string;
  /** Tried in order on the same endpoint if earlier ones fail — only meaningful when
   *  provider === "openrouter", since these are OpenRouter model ids. */
  fallbackModels: string[];
  provider: string;
}

// The wizard's own drafting calls (mention extraction, brand-profile draft, prompt suggestions)
// all run on OpenRouter and try these in order — cheap/fast first, falling back if a model is
// unavailable or errors, so no self-hoster is stuck because one vendor is briefly down.
const ONBOARDING_MODEL_CHAIN = [
  "z-ai/glm-5.2",
  "deepseek/deepseek-v4-pro",
  "google/gemini-3-flash-preview",
];

/**
 * Which provider does the mention call. Both endpoints are OpenAI-shaped, so one code path
 * covers them; OpenRouter comes first because a self-hoster may only have that key.
 * `EXTRACTION_MODEL` overrides the default for whichever provider is chosen (and disables the
 * fallback chain — an explicit override means "use exactly this model").
 *
 * Exported because the onboarding wizard's brand-profile and prompt-suggestion drafting
 * (lib/brandProfile.ts, lib/promptSuggestions.ts) need the exact same key resolution — one
 * cheap JSON-mode chat completion, same as mention extraction below.
 */
export function resolveExtractor(): Extractor | null {
  const override = process.env.EXTRACTION_MODEL?.trim();

  const openrouter = providerKey("openrouter");
  if (openrouter) {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: openrouter,
      model: override || ONBOARDING_MODEL_CHAIN[0],
      fallbackModels: override ? [] : ONBOARDING_MODEL_CHAIN.slice(1),
      provider: "openrouter",
    };
  }

  const openai = providerKey("openai");
  if (openai) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      key: openai,
      model: override || "gpt-4o-mini",
      fallbackModels: [],
      provider: "openai",
    };
  }

  return null;
}

/**
 * POST a chat completion, retrying with each of `extractor.fallbackModels` in turn if the
 * request fails (non-2xx or network error) — so a single vendor outage doesn't break onboarding
 * or mention extraction. Returns the first successful response; throws the last error if every
 * model in the chain fails.
 */
export async function chatCompletionWithFallback(
  extractor: Extractor,
  body: Record<string, unknown>
): Promise<Response> {
  const models = [extractor.model, ...extractor.fallbackModels];
  let lastErr: unknown;

  for (const model of models) {
    try {
      const res = await fetch(extractor.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${extractor.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, model }),
      });
      if (res.ok) return res;
      lastErr = new Error(`${extractor.provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Whether mentions can be extracted at all. Surfaced by scripts/doctor.js and the dashboard:
 * without this, runs still "succeed" and visibility silently stays at 0% forever.
 */
export function extractionStatus():
  | { ready: true; provider: string; model: string }
  | { ready: false; reason: string } {
  const e = resolveExtractor();
  return e
    ? { ready: true, provider: e.provider, model: e.model }
    : { ready: false, reason: "no OpenRouter or OpenAI key configured" };
}

/**
 * Ask the extraction model which known brands appear in `answer`. Throws on transport failure
 * so the caller can record it — silence here is indistinguishable from "no brands mentioned".
 */
export async function extractMentions(
  answer: string,
  brands: KnownBrand[]
): Promise<MentionExtraction> {
  if (brands.length === 0 || !answer.trim()) {
    return { mentions: [], costUsd: 0 };
  }

  const extractor = resolveExtractor();
  if (!extractor) {
    throw new Error("Mention extraction needs an OpenRouter or OpenAI key — none configured");
  }

  const brandList = brands.map((b) => `- ${b.name} (id: ${b.id})`).join("\n");
  const system =
    "You detect brand mentions in text. You are given an ANSWER and a list of KNOWN BRANDS. " +
    "Return ONLY the brands from the list that are genuinely mentioned in the answer. " +
    "For each, give its 1-based position = the order of its first appearance relative to the " +
    "other mentioned brands (first mentioned = 1). Respond with strict JSON only, no prose.";
  const user =
    `KNOWN BRANDS:\n${brandList}\n\nANSWER:\n"""\n${answer}\n"""\n\n` +
    `Respond as: {"mentions":[{"brand_id":"...","position":1}, ...]}. ` +
    `If none are mentioned, respond {"mentions":[]}.`;

  // extractMentions can fail the whole run if it throws (the caller decides), so let
  // chatCompletionWithFallback exhaust the model chain before giving up.
  const res = await chatCompletionWithFallback(extractor, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    // OpenRouter returns the exact billed cost here; OpenAI ignores it and we fall back
    // to estimating from token counts below.
    ...(extractor.provider === "openrouter" ? { usage: { include: true } } : {}),
  });

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";

  const validIds = new Set(brands.map((b) => b.id));
  let mentions: ExtractedMention[] = [];
  try {
    const parsed = JSON.parse(content);
    mentions = (parsed.mentions ?? [])
      .filter((m: { brand_id?: string }) => m.brand_id && validIds.has(m.brand_id))
      .map((m: { brand_id: string; position?: number }) => ({
        brand_id: m.brand_id,
        position: typeof m.position === "number" ? m.position : null,
      }));
  } catch {
    mentions = [];
  }

  const usage = data.usage ?? {};
  const costUsd =
    typeof usage.cost === "number"
      ? usage.cost // exact, from OpenRouter
      : ((usage.prompt_tokens ?? 0) / 1000) * USD_PER_1K_INPUT +
        ((usage.completion_tokens ?? 0) / 1000) * USD_PER_1K_OUTPUT;

  return { mentions, costUsd };
}

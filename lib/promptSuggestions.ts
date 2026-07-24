// lib/promptSuggestions.ts — draft a starter prompt set from the brand's own context, grouped
// by topic. Same extractor pattern as lib/brandProfile.ts and lib/extract.ts.

import { resolveExtractor, chatCompletionWithFallback } from "./extract";
import type { Brand } from "./data";

export interface PromptTopic {
  topic: string;
  prompts: string[];
}

/** Returns [] on any failure — the wizard's empty state lets the user add prompts manually
 *  later from /prompts, so this never blocks onboarding. */
export async function suggestPrompts(brand: Brand): Promise<PromptTopic[]> {
  const extractor = resolveExtractor();
  if (!extractor) return [];

  const system =
    "You write realistic buyer-intent search prompts for tracking a brand's visibility in AI " +
    "answers (ChatGPT, Perplexity, etc). Given a brand's profile, produce 3-5 topics relevant " +
    "to what buyers would ask about, each with 3-5 natural-language prompts a real prospect " +
    "might type. Respond with strict JSON only, no prose.";
  const user =
    `BRAND: ${brand.name}\n` +
    `DESCRIPTION: ${brand.description ?? ""}\n` +
    `INDUSTRY: ${brand.industry ?? ""}\n` +
    `ADJECTIVES: ${brand.adjectives.join(", ")}\n` +
    `PRODUCTS/SERVICES: ${brand.products.join(", ")}\n\n` +
    `Respond as: {"topics":[{"topic":"...","prompts":["...","..."]}]}`;

  try {
    const res = await chatCompletionWithFallback(extractor, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.topics)) return [];

    return parsed.topics
      .map((t: { topic?: string; prompts?: unknown }) => ({
        topic: String(t.topic ?? "").trim(),
        prompts: Array.isArray(t.prompts)
          ? t.prompts.map((p) => String(p).trim()).filter(Boolean)
          : [],
      }))
      .filter((t: PromptTopic) => t.topic && t.prompts.length);
  } catch {
    return [];
  }
}

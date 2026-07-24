// lib/engines/perplexity.ts — Perplexity Sonar adapter.
// Sonar is search-grounded by default: every response carries `citations` (source URLs).
// Docs: https://docs.perplexity.ai
import { EngineAdapter, EngineResult, domainOf } from "./types";
import { providerKey, providerModel, isProviderConfigured } from "../providers";

const MODEL = "sonar";
// Sonar pricing is roughly $1/M input + $1/M output tokens plus a small per-request search
// fee. We approximate; the number is for the spend guardrail, not billing-grade accounting.
const USD_PER_1K_TOKENS = 0.001;
const SEARCH_FEE_USD = 0.005;

export const perplexity: EngineAdapter = {
  id: "perplexity",
  isConfigured: () => isProviderConfigured("perplexity"),

  async run(prompt: string): Promise<EngineResult> {
    const key = providerKey("perplexity");
    if (!key) throw new Error("Perplexity: no API key configured");

    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModel("perplexity", MODEL),
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";

    // Sonar returns citation URLs either as `citations` (string[]) or `search_results`.
    const urls: string[] =
      data.citations ??
      (data.search_results ?? []).map((s: { url: string }) => s.url) ??
      [];

    const citations = dedupe(urls).map((url) => ({ url, domain: domainOf(url) }));

    const usage = data.usage ?? {};
    const totalTokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    const costUsd = (totalTokens / 1000) * USD_PER_1K_TOKENS + SEARCH_FEE_USD;

    return { text, citations, costUsd };
  },
};

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

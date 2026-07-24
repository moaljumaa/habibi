// lib/engines/gemini.ts — Google Gemini adapter with Google Search grounding.
// With the google_search tool enabled, responses carry groundingMetadata whose
// groundingChunks[].web.uri are the cited sources.
// Docs: https://ai.google.dev/gemini-api/docs/grounding
import { EngineAdapter, EngineResult, domainOf } from "./types";
import { providerKey, providerModel, isProviderConfigured } from "../providers";

const MODEL = "gemini-2.0-flash";
// Flash is cheap: ~$0.10/M input, $0.40/M output. Grounding adds a per-request fee (~$0.007).
const USD_PER_1K_INPUT = 0.0001;
const USD_PER_1K_OUTPUT = 0.0004;
const GROUNDING_FEE_USD = 0.007;

export const gemini: EngineAdapter = {
  id: "gemini",
  isConfigured: () => isProviderConfigured("gemini"),

  async run(prompt: string): Promise<EngineResult> {
    const key = providerKey("gemini");
    if (!key) throw new Error("Gemini: no API key configured");
    const model = providerModel("gemini", MODEL);

    // Key goes in a header, not the query string — query strings leak into logs and traces.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];

    const text: string =
      (candidate?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("") ?? "";

    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const urls: string[] = chunks
      .map((c: { web?: { uri?: string } }) => c.web?.uri)
      .filter(Boolean);

    const citations = dedupe(urls).map((u) => ({ url: u, domain: domainOf(u) }));

    const usage = data.usageMetadata ?? {};
    const costUsd =
      ((usage.promptTokenCount ?? 0) / 1000) * USD_PER_1K_INPUT +
      ((usage.candidatesTokenCount ?? 0) / 1000) * USD_PER_1K_OUTPUT +
      GROUNDING_FEE_USD;

    return { text, citations, costUsd };
  },
};

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

// lib/engines/openai.ts — OpenAI adapter using the Responses API + the web_search tool.
// This is the closest API proxy for "ChatGPT with browsing": the model searches the web and
// returns url_citation annotations pointing at the sources it used.
// Docs: https://platform.openai.com/docs/guides/tools-web-search
import { EngineAdapter, EngineResult, domainOf } from "./types";
import { providerKey, providerModel, isProviderConfigured } from "../providers";

const MODEL = "gpt-4o";
// gpt-4o approx: $2.5/M input, $10/M output. Plus a web_search tool-call fee (~$0.01/call).
const USD_PER_1K_INPUT = 0.0025;
const USD_PER_1K_OUTPUT = 0.01;
const SEARCH_FEE_USD = 0.01;

export const openai: EngineAdapter = {
  id: "openai",
  isConfigured: () => isProviderConfigured("openai"),

  async run(prompt: string): Promise<EngineResult> {
    const key = providerKey("openai");
    if (!key) throw new Error("OpenAI: no API key configured");

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: providerModel("openai", MODEL),
        tools: [{ type: "web_search" }],
        input: prompt,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();

    // Responses API: walk output items, collect assistant text + url_citation annotations.
    let text = "";
    const urls: string[] = [];
    for (const item of data.output ?? []) {
      if (item.type !== "message") continue;
      for (const part of item.content ?? []) {
        if (part.type === "output_text") {
          text += part.text ?? "";
          for (const ann of part.annotations ?? []) {
            if (ann.type === "url_citation" && ann.url) urls.push(ann.url);
          }
        }
      }
    }

    const citations = dedupe(urls).map((url) => ({ url, domain: domainOf(url) }));

    const usage = data.usage ?? {};
    const costUsd =
      ((usage.input_tokens ?? 0) / 1000) * USD_PER_1K_INPUT +
      ((usage.output_tokens ?? 0) / 1000) * USD_PER_1K_OUTPUT +
      SEARCH_FEE_USD;

    return { text, citations, costUsd };
  },
};

function dedupe(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

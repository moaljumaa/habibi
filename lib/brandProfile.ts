// lib/brandProfile.ts — draft a structured brand profile from a scraped page, via one cheap
// LLM call. Same extractor-resolution pattern as lib/extract.ts's mention extraction: the
// wizard's own just-entered OpenRouter key is what pays for this.

import { resolveExtractor, chatCompletionWithFallback } from "./extract";

export interface DraftedBrandProfile {
  name: string;
  description: string;
  industry: string;
  adjectives: string[];
  products: string[];
}

const EMPTY: DraftedBrandProfile = {
  name: "",
  description: "",
  industry: "",
  adjectives: [],
  products: [],
};

/**
 * Never throws on a parse failure — a partial or empty draft is fine, since the user edits and
 * confirms this in step 3 anyway. It DOES throw if there's no extractor configured at all,
 * since that's a real precondition failure the caller should surface.
 */
export async function draftBrandProfile(
  url: string,
  pageText: string
): Promise<DraftedBrandProfile> {
  const extractor = resolveExtractor();
  if (!extractor) {
    throw new Error("No OpenRouter or OpenAI key configured yet.");
  }
  if (!pageText.trim()) return EMPTY;

  const system =
    "You draft a structured brand profile from a company's own marketing page text. " +
    "Respond with strict JSON only, no prose. Keep the description to one paragraph. " +
    "Give 3-6 short adjectives that describe the brand's identity/tone, and 3-6 named " +
    "products or services actually mentioned in the text.";
  const user =
    `SOURCE URL: ${url}\n\nPAGE TEXT:\n"""\n${pageText}\n"""\n\n` +
    `Respond as: {"name":"...","description":"...","industry":"...",` +
    `"adjectives":["...","..."],"products":["...","..."]}`;

  let res: Response;
  try {
    res = await chatCompletionWithFallback(extractor, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
  } catch (err) {
    throw new Error(
      `Couldn't draft a profile (${err instanceof Error ? err.message : String(err)}).`
    );
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";

  try {
    const parsed = JSON.parse(content);
    const strList = (v: unknown, max: number) =>
      Array.isArray(v)
        ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max)
        : [];
    return {
      name: String(parsed.name ?? "").trim(),
      description: String(parsed.description ?? "").trim(),
      industry: String(parsed.industry ?? "").trim(),
      adjectives: strList(parsed.adjectives, 6),
      products: strList(parsed.products, 6),
    };
  } catch {
    return EMPTY;
  }
}

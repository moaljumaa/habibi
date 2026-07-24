// lib/scrape.ts — render a public marketing page and pull its visible text, for the onboarding
// wizard's brand-context draft.
//
// Real Chromium, not a plain fetch: many marketing sites (Next.js included) render their content
// client-side, so a static HTML fetch sees an empty shell. No auth, no stealth plugins, no
// fingerprint evasion needed here — this is a single unauthenticated page load of a public site,
// nothing like Linki's LinkedIn automation.
//
// The browser is a module-level singleton, launched lazily and reused across requests — same
// pattern as lib/db.ts's `_db`. Safe because this runs inside a long-lived `npm start` process,
// not a serverless function.

import { chromium, type Browser } from "playwright";

const NAV_TIMEOUT_MS = 15_000;
const OUTER_TIMEOUT_MS = 20_000;
const MAX_CHARS = 8_000;

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({ headless: true });
  return _browser;
}

/** Closes the shared browser, if one was launched. Not required for correctness — available for
 *  a graceful-shutdown hook if one is added later. */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i;

function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (PRIVATE_HOST.test(url.hostname)) {
    throw new Error("Can't scrape a local or private address.");
  }
  return url;
}

/** Visible text of the page's <body>, truncated to a size that keeps the draft LLM call cheap. */
export async function scrapeVisibleText(rawUrl: string): Promise<string> {
  const url = assertPublicHttpUrl(rawUrl);

  const work = async (): Promise<string> => {
    const browser = await getBrowser();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      try {
        await page.goto(url.toString(), { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      } catch {
        // networkidle can time out on sites with long-polling/analytics beacons that never go
        // quiet — fall back to whatever rendered by the time domcontentloaded fired.
        await page.goto(url.toString(), {
          waitUntil: "domcontentloaded",
          timeout: NAV_TIMEOUT_MS,
        });
      }
      const text = await page.evaluate(() => document.body?.innerText ?? "");
      return text.trim().slice(0, MAX_CHARS);
    } finally {
      await context.close();
    }
  };

  return Promise.race([
    work(),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out loading that site.")), OUTER_TIMEOUT_MS)
    ),
  ]).catch((err) => {
    throw err instanceof Error ? err : new Error("Could not load that site.");
  });
}

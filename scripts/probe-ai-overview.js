#!/usr/bin/env node
// scripts/probe-ai-overview.js — EXPERIMENT, not product code.
//
// Question this answers: can a plain Playwright Chromium, on a normal home IP, with no
// login and no proxy, reach a Google AI Overview and read its cited sources?
//
// We are deliberately NOT starting from Camoufox. OneGlanse (MIT) uses Camoufox because it
// drives *logged-in* ChatGPT/Claude/Gemini, where fingerprinting is the whole fight. AI
// Overviews needs no account, so stock Chromium may be enough — and if it is, we avoid a
// Python + custom-Firefox dependency that would wreck the one-npm-install self-host story.
// Prove that before paying for it.
//
// Selectors below are adopted from OneGlanse (MIT, Copyright (c) 2025 Aryaman Todkar):
//   apps/agent/src/core/providers/ai-overview/
// They encode which Google DOM containers hold the overview and its source cards — knowledge
// that costs hours to rediscover. This script verifies they still match live before we
// commit any of it to lib/.
//
// Usage:
//   node scripts/probe-ai-overview.js "best cold email tools"
//   node scripts/probe-ai-overview.js "..." --headful   # watch it
//   node scripts/probe-ai-overview.js "..." --hl=de --gl=de

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const flags = new Map(
  args.filter((a) => a.startsWith("--")).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const query = args.filter((a) => !a.startsWith("--")).join(" ") ||
  "best open source cold email tool";

const HEADFUL = flags.has("headful");
const HL = flags.get("hl") || "en";
const GL = flags.get("gl") || "us";
const OUT_DIR = path.join(__dirname, "..", "data", "probe");

// ── selectors (from OneGlanse) ────────────────────────────────────────────────
const MAIN_COL = '[data-container-id="main-col"]';   // the overview answer body
const RHS_COL = '[data-container-id="rhs-col"]';     // the sources panel
const SOURCE_CARD = "div[data-src-id]";              // one cited source
const CONSENT = "button#L2AGLb, button#W0wltc, form[action*='consent.google.com'] button";

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

// Google's two ways of saying no. Distinguishing them matters: /sorry/ is an IP-reputation
// problem (proxy/VPS), a login redirect is a session problem. Same symptom, opposite fix.
function assertNotBlocked(page) {
  const url = page.url();
  if (url.includes("/sorry/")) {
    throw new Error(`BLOCKED: Google bot detection (/sorry/ page). IP is flagged.\n  ${url}`);
  }
  if (url.includes("accounts.google.com")) {
    throw new Error(`BLOCKED: redirected to Google login.\n  ${url}`);
  }
}

async function dismissConsent(page) {
  const btn = page.locator(CONSENT).first();
  const visible = await btn.isVisible({ timeout: 2500 }).catch(() => false);
  if (!visible) return false;
  await btn.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1000);
  return true;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("─".repeat(70));
  console.log(`AI Overview probe`);
  console.log(`  query   : ${query}`);
  console.log(`  locale  : hl=${HL} gl=${GL}`);
  console.log(`  browser : chromium (stock playwright, no stealth, no proxy)`);
  console.log(`  mode    : ${HEADFUL ? "headful" : "headless"}`);
  console.log("─".repeat(70));

  const t0 = Date.now();
  const browser = await chromium.launch({ headless: !HEADFUL });
  const ctx = await browser.newContext({
    locale: HL === "de" ? "de-DE" : "en-US",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  const result = {
    query, hl: HL, gl: GL,
    at: new Date().toISOString(),
    blocked: false,
    overviewFound: false,
    sourcesContainerFound: false,
    answerChars: 0,
    sources: [],
    error: null,
  };

  try {
    // Warm cookies on the homepage first — OneGlanse does this and it also gives us a
    // cheap early read on whether this IP is already burned.
    log("warm", "GET google.com");
    await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    assertNotBlocked(page);
    if (await dismissConsent(page)) log("warm", "consent dialog dismissed");

    // Go straight to the results URL rather than typing into the box. Fewer moving parts,
    // and it lets us pin locale explicitly via hl/gl.
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=${HL}&gl=${GL}`;
    log("search", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    assertNotBlocked(page);
    await dismissConsent(page);

    // The overview is injected asynchronously after the SERP paints. There is no "done"
    // event, so we poll for the container and then let it settle.
    log("wait", "polling for AI Overview container…");
    let seen = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      assertNotBlocked(page);
      if (await page.locator(MAIN_COL).count() > 0) { seen = true; break; }
      await page.waitForTimeout(400);
    }
    result.overviewFound = seen;
    log("wait", seen ? "container present" : "container NEVER appeared");
    if (seen) await page.waitForTimeout(2500); // let streaming text settle

    // Expand the sources panel — Google collapses it behind a "Show all"/"More" button.
    const expanded = await page.evaluate(({ rhs }) => {
      const root = document.querySelector(rhs);
      if (!root) return { containerFound: false, clicked: 0 };
      let clicked = 0;
      for (const b of root.querySelectorAll('[role="button"], button')) {
        const t = `${b.textContent || ""} ${b.getAttribute("aria-label") || ""}`.toLowerCase();
        if (t.includes("videos")) continue;
        if (t.includes("more") || t.includes("all") || t.includes("expand")) {
          b.click(); clicked++;
        }
      }
      return { containerFound: true, clicked };
    }, { rhs: RHS_COL });
    result.sourcesContainerFound = expanded.containerFound;
    log("expand", `rhs-col found=${expanded.containerFound} buttons clicked=${expanded.clicked}`);
    if (expanded.clicked) await page.waitForTimeout(1500);

    // Read the answer text.
    if (seen) {
      const text = await page.locator(MAIN_COL).first().innerText().catch(() => "");
      result.answerChars = text.length;
      result.answerPreview = text.slice(0, 600);
    }

    // Read the source cards — this is the whole point. Page-level citations.
    result.sources = await page.evaluate(({ rhs, card }) => {
      const out = [];
      const root = document.querySelector(rhs);
      if (!root) return out;
      for (const c of root.querySelectorAll(card)) {
        const link = c.querySelector('a[href^="http"]');
        if (!link) continue;
        const title = (link.getAttribute("aria-label") || "")
          .replace(/\.\s*Opens in new tab\.?$/i, "").trim() || link.href;
        out.push({
          url: link.href,
          domain: (() => { try { return new URL(link.href).hostname.replace(/^www\./, ""); } catch { return ""; } })(),
          title,
          snippet: (c.querySelector("[data-crb-snippet-text]")?.textContent || "").trim(),
        });
      }
      return out;
    }, { rhs: RHS_COL, card: SOURCE_CARD });

    // Fallback: if the known card selector found nothing, dump ALL outbound links in the
    // sources panel. Tells us whether the selector rotted or the panel is simply absent.
    if (result.sources.length === 0 && expanded.containerFound) {
      result.fallbackLinks = await page.evaluate(({ rhs }) => {
        const root = document.querySelector(rhs);
        if (!root) return [];
        return Array.from(root.querySelectorAll('a[href^="http"]'))
          .map((a) => a.href)
          .filter((h) => !h.includes("google.com"))
          .slice(0, 25);
      }, { rhs: RHS_COL });
    }
  } catch (err) {
    result.error = String(err.message || err);
    result.blocked = result.error.includes("BLOCKED");
    log("error", result.error);
  }

  // Always keep the artifacts — a screenshot is the fastest way to see why a selector missed.
  const stamp = Date.now();
  const shot = path.join(OUT_DIR, `aio-${stamp}.png`);
  const html = path.join(OUT_DIR, `aio-${stamp}.html`);
  const json = path.join(OUT_DIR, `aio-${stamp}.json`);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  fs.writeFileSync(html, await page.content().catch(() => ""));
  fs.writeFileSync(json, JSON.stringify(result, null, 2));

  await browser.close();

  console.log("─".repeat(70));
  console.log(`elapsed            : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`blocked            : ${result.blocked ? "YES" : "no"}`);
  console.log(`overview container : ${result.overviewFound ? "FOUND" : "missing"}`);
  console.log(`sources container  : ${result.sourcesContainerFound ? "FOUND" : "missing"}`);
  console.log(`answer chars       : ${result.answerChars}`);
  console.log(`sources extracted  : ${result.sources.length}`);
  if (result.sources.length) {
    console.log("");
    for (const s of result.sources.slice(0, 12)) {
      console.log(`  ${s.domain.padEnd(28)} ${s.title.slice(0, 60)}`);
    }
  }
  if (result.fallbackLinks?.length) {
    console.log(`\n  selector found 0 cards, but ${result.fallbackLinks.length} raw links exist:`);
    for (const l of result.fallbackLinks.slice(0, 10)) console.log(`    ${l.slice(0, 90)}`);
  }
  if (result.answerPreview) {
    console.log(`\n  answer preview:\n    ${result.answerPreview.slice(0, 400).replace(/\n/g, "\n    ")}`);
  }
  console.log("─".repeat(70));
  console.log(`artifacts: ${path.relative(process.cwd(), shot)}`);
  console.log(`           ${path.relative(process.cwd(), json)}`);

  const ok = result.overviewFound && result.sources.length > 0;
  console.log(`\nVERDICT: ${ok ? "WORKS — stock Chromium is sufficient, no Camoufox needed" : "INCONCLUSIVE — see screenshot"}`);
  process.exit(ok ? 0 : 1);
})();

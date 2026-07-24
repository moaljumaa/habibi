#!/usr/bin/env node
/**
 * scripts/probe-engine.js — make ONE real call to an engine and dump what actually comes back.
 *
 * The adapters in lib/engines are written from provider docs. Docs lie, drift, and omit.
 * This proves the response shape empirically before we trust a single field name.
 *
 *   node scripts/probe-engine.js openrouter "best CRM for freelancers"
 *   node scripts/probe-engine.js openrouter "..." --raw    # full payload, unabridged
 *
 * Reads keys from .env. Costs real money — one call per invocation.
 */
const fs = require("fs");
const path = require("path");

// ── .env (no dependency; we only need KEY=value) ──────────────────────────────
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const [engine, prompt] = process.argv.slice(2);
const RAW = process.argv.includes("--raw");

if (!engine || !prompt) {
  console.error('usage: node scripts/probe-engine.js <engine> "<prompt>" [--raw]');
  process.exit(1);
}

const PROBES = {
  /** OpenRouter chat/completions + the `web` plugin. */
  async openrouter() {
    const key = need("OPENROUTER_API_KEY");
    const model = process.env.OPENROUTER_MODEL || "openai/gpt-4.1";
    console.log(`model: ${model}`);

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        plugins: [{ id: "web", max_results: 5 }],
      }),
    });

    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}\n${body}`);
    const data = JSON.parse(body);

    const message = data.choices?.[0]?.message ?? {};
    const anns = message.annotations ?? [];

    report({
      data,
      text: message.content ?? "",
      annotations: anns,
      urls: anns.map((a) => a?.url_citation?.url).filter(Boolean),
      extra: async () => {
        // Does /generation really report an already-billed cost?
        if (!data.id) return console.log("no generation id on response");
        const g = await fetch(
          `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(data.id)}`,
          { headers: { Authorization: `Bearer ${key}` } }
        );
        const gb = await g.text();
        console.log(`\n── /generation (HTTP ${g.status}) ──`);
        console.log(g.ok ? trim(gb, 1200) : gb);
      },
    });
  },
};

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing ${name} — put it in .env (see .env.example)`);
    process.exit(1);
  }
  return v;
}

function trim(s, n) {
  return s.length > n && !RAW ? s.slice(0, n) + `\n… [+${s.length - n} chars, --raw for all]` : s;
}

async function report({ data, text, annotations, urls, extra }) {
  console.log(`\n── answer (${text.length} chars) ──`);
  console.log(trim(text, 600) || "(empty — this is a problem)");

  console.log(`\n── citations: ${urls.length} ──`);
  urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  if (!urls.length) {
    console.log("  NONE. Either grounding didn't fire or the annotation shape differs.");
    console.log("  Check the raw payload below for where sources actually live.");
  }

  if (annotations.length) {
    console.log(`\n── annotation[0] shape ──`);
    console.log(JSON.stringify(annotations[0], null, 2));
  }

  console.log(`\n── top-level keys ──\n  ${Object.keys(data).join(", ")}`);
  if (data.usage) console.log(`\n── usage ──\n${JSON.stringify(data.usage, null, 2)}`);

  if (extra) await extra();

  if (RAW) {
    console.log(`\n── RAW ──`);
    console.log(JSON.stringify(data, null, 2));
  }
}

const probe = PROBES[engine];
if (!probe) {
  console.error(`unknown engine "${engine}" — have: ${Object.keys(PROBES).join(", ")}`);
  process.exit(1);
}

probe().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * scripts/doctor.js — check whether this install is actually able to produce data.
 *
 *   node scripts/doctor.js           # offline checks only, free
 *   node scripts/doctor.js --live    # also makes real API calls (costs a few cents)
 *
 * Exists because the app can look fine and still measure nothing: a key that won't decrypt, a
 * model id that no longer exists, or a missing extraction key all fail quietly.
 */
const path = require("path");
const jiti = require("jiti")(path.join(__dirname, ".."), { interopDefault: true });

const LIVE = process.argv.includes("--live");
const root = path.join(__dirname, "..");
process.chdir(root);

let failures = 0;
let warnings = 0;

const ok = (label, detail = "") => console.log(`  ok    ${label}${detail ? "  " + detail : ""}`);
const warn = (label, detail = "") => {
  warnings++;
  console.log(`  warn  ${label}${detail ? "  " + detail : ""}`);
};
const bad = (label, detail = "") => {
  failures++;
  console.log(`  FAIL  ${label}${detail ? "  " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

(async () => {
  console.log(`habibi doctor ${LIVE ? "(live)" : "(offline — pass --live to test real calls)"}`);

  // ── database ───────────────────────────────────────────────────────────────
  section("Database");
  let db;
  try {
    db = jiti("./lib/db.ts").getDb();
    ok("opened", process.env.DATABASE_PATH || "./data/app.db");
  } catch (e) {
    bad("cannot open database", e.message);
    return done();
  }

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
  for (const t of ["brand", "prompt", "run", "mention", "citation", "setting", "provider"]) {
    tables.includes(t) ? ok(`table ${t}`) : bad(`table ${t} missing`);
  }
  const providerCols = db.prepare("PRAGMA table_info(provider)").all().map((c) => c.name);
  providerCols.includes("models")
    ? ok("provider.models column")
    : bad("provider.models column missing — migration didn't run");

  // ── encryption ─────────────────────────────────────────────────────────────
  section("Encryption");
  const { encrypt, decrypt } = jiti("./lib/crypto.ts");
  try {
    const probe = "doctor-" + Date.now();
    decrypt(encrypt(probe)) === probe
      ? ok("master key works", process.env.HABIBI_SECRET_KEY ? "from env" : "from data/.secret")
      : bad("encrypt/decrypt round-trip failed");
  } catch (e) {
    bad("crypto unavailable", e.message);
  }

  // ── tracking config ────────────────────────────────────────────────────────
  section("Tracking config");
  const { listBrands, listPrompts } = jiti("./lib/data.ts");
  const brands = listBrands();
  const selfBrand = brands.find((b) => b.is_self);
  brands.length ? ok(`${brands.length} brand(s)`) : bad("no brands — nothing to measure");
  selfBrand
    ? ok("self brand", `${selfBrand.name} [${selfBrand.domains.join(", ") || "no domains"}]`)
    : bad("no brand marked is_self — visibility can never be computed");
  if (selfBrand && !selfBrand.domains.length)
    warn("self brand has no domains", "citations can't be attributed to you");

  const prompts = listPrompts(true);
  prompts.length ? ok(`${prompts.length} active prompt(s)`) : bad("no active prompts");

  // ── providers ──────────────────────────────────────────────────────────────
  section("Providers");
  const { describeProviders, providerKey } = jiti("./lib/providers.ts");
  const providers = describeProviders();
  for (const p of providers) {
    if (p.undecryptable) bad(`${p.id}: key stored but won't decrypt`, "re-enter it in Settings");
    else if (p.configured) ok(`${p.id}`, `${p.hint} (${p.source})`);
    else console.log(`  --    ${p.id}: not connected`);
  }
  if (!providers.some((p) => p.configured)) bad("no provider connected — runs cannot start");

  // ── engines ────────────────────────────────────────────────────────────────
  section("Engines");
  const { activeEngines } = jiti("./lib/engines/index.ts");
  const engines = activeEngines();
  engines.length
    ? engines.forEach((e) => ok(e.id))
    : bad("no active engines", "connect a provider and select models");

  // Selected model ids must still exist upstream — a retired id fails as a 400 mid-run.
  const orModels = jiti("./lib/providers.ts").selectedModels("openrouter");
  if (orModels.length) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      const catalogue = new Set((await res.json()).data.map((m) => m.id));
      for (const m of orModels) {
        catalogue.has(m) ? ok(`model ${m}`, "exists upstream") : bad(`model ${m}`, "NOT in catalogue");
      }
    } catch (e) {
      warn("could not verify models against catalogue", e.message);
    }
  }

  // ── extraction ─────────────────────────────────────────────────────────────
  // Citations are deterministic, but MENTIONS need this call. Without it visibility is
  // permanently 0% even though runs "succeed" — the bug this script was written for.
  section("Mention extraction");
  const { extractionStatus } = jiti("./lib/extract.ts");
  const ex = extractionStatus();
  ex.ready
    ? ok("configured", `${ex.provider} · ${ex.model}`)
    : bad("not configured", ex.reason + " — mentions will always be empty");

  // ── history ────────────────────────────────────────────────────────────────
  section("Run history");
  const stats = db
    .prepare(
      `SELECT COUNT(*) runs, SUM(error IS NOT NULL) errors,
              ROUND(COALESCE(SUM(cost_usd),0),4) spend FROM run`
    )
    .get();
  console.log(`  runs=${stats.runs} errors=${stats.errors ?? 0} spend=$${stats.spend}`);
  console.log(
    `  citations=${db.prepare("SELECT COUNT(*) n FROM citation").get().n}` +
      `  mentions=${db.prepare("SELECT COUNT(*) n FROM mention").get().n}`
  );
  const okRuns = stats.runs - (stats.errors ?? 0);
  if (okRuns > 0 && stats.spend === 0)
    warn("successful runs recorded $0 spend", "the daily cap can't protect you");

  const recent = db
    .prepare(
      `SELECT engine, COUNT(*) n, substr(error,1,120) e FROM run
        WHERE error IS NOT NULL AND created_at >= datetime('now','-1 day')
        GROUP BY engine, error`
    )
    .all();
  for (const r of recent) warn(`${r.n}× failed (24h) on ${r.engine}`, r.e);

  // ── live calls ─────────────────────────────────────────────────────────────
  if (LIVE) {
    section("Live calls");
    const key = providerKey("openrouter");
    if (!key) {
      warn("skipping — OpenRouter not connected");
    } else {
      const model = orModels[0] || "openai/gpt-5.2";
      try {
        const t0 = Date.now();
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "What is the capital of France? One sentence." }],
            plugins: [{ id: "web", max_results: 3 }],
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(body).slice(0, 200));
        const msg = body.choices?.[0]?.message ?? {};
        const anns = msg.annotations ?? [];
        ok(`${model} responded`, `${Date.now() - t0}ms, ${(msg.content || "").length} chars`);
        anns.length
          ? ok(`${anns.length} citation annotation(s)`)
          : warn("no citations returned", "grounding may not have fired for this prompt");

        // Is the already-billed cost really readable from /generation?
        if (body.id) {
          await new Promise((r) => setTimeout(r, 1500)); // it lags the completion
          const g = await fetch(
            `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(body.id)}`,
            { headers: { Authorization: `Bearer ${key}` } }
          );
          const gb = await g.json().catch(() => null);
          const cost = gb?.data?.total_cost;
          typeof cost === "number"
            ? ok("cost reported by /generation", `$${cost}`)
            : bad(
                "/generation gave no total_cost",
                `HTTP ${g.status} keys=${gb?.data ? Object.keys(gb.data).join(",") : "none"}`
              );
        }
      } catch (e) {
        bad("live call failed", String(e.message).slice(0, 220));
      }
    }
  }

  done();
})();

function done() {
  console.log(
    `\n${failures ? "FAILED" : "OK"} — ${failures} failure(s), ${warnings} warning(s)\n`
  );
  process.exit(failures ? 1 : 0);
}

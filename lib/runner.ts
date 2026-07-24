// lib/runner.ts — the core tracking loop.
//
// For each active prompt × active engine × N samples:
//   1. call the engine adapter (grounded answer + cited URLs + cost)
//   2. store the run
//   3. store citations deterministically (mark is_self by domain)
//   4. one cheap LLM call to extract brand mentions → store them
// Cost guardrails: stops before starting a run once the daily spend cap is reached.
//
// This is fully open-core. The PAID Google-AI-Overviews engine (premium.overview) is invoked
// here through the premium?. switch only — never imported directly. See docs/OPEN_CORE.md.

import { randomUUID } from "crypto";
import { getDb } from "./db";
import { activeEngines, EngineResult } from "./engines";
import { extractMentions, extractionStatus } from "./extract";
import {
  listPrompts,
  listBrands,
  selfDomains,
  getNumberSetting,
  spendToday,
} from "./data";
import { premium } from "./premium";

export interface RunSummary {
  started: string;
  finished: string;
  runs: number;
  errors: number;
  costUsd: number;
  stoppedByCap: boolean;
}

let _running = false;
export function isRunning(): boolean {
  return _running;
}

function log(msg: string): void {
  console.log(`[run] ${msg}`);
}

/** Run every active prompt across every configured engine, N samples each. */
export async function runAll(): Promise<RunSummary> {
  if (_running) throw new Error("A run is already in progress");
  _running = true;

  const started = new Date().toISOString();
  const summary: RunSummary = {
    started,
    finished: started,
    runs: 0,
    errors: 0,
    costUsd: 0,
    stoppedByCap: false,
  };

  try {
    const db = getDb();
    const prompts = listPrompts(true);
    const brands = listBrands();
    const selfDoms = selfDomains();
    const samples = Math.max(1, getNumberSetting("samples_per_prompt", envInt("SAMPLES_PER_PROMPT", 1)));
    const dailyCap = getNumberSetting("daily_spend_cap_usd", envFloat("DAILY_SPEND_CAP_USD", 5));

    const engines = activeEngines().slice();
    // Register the paid Overviews engine only when the commercial build provides it.
    const overview = premium?.overview;

    // A run is slow, costs money, and happens in the background — narrate it in the terminal
    // so a self-hoster can see what's happening without reading the database.
    const ex = extractionStatus();
    log(
      `starting — ${prompts.length} prompt(s) × ${samples} sample(s) × ` +
        `${engines.length + (overview ? 1 : 0)} engine(s) = ` +
        `${prompts.length * samples * (engines.length + (overview ? 1 : 0))} call(s)`
    );
    log(`engines: ${engines.map((e) => e.id).join(", ") || "none"}`);
    log(`brands: ${brands.length} (${brands.map((b) => b.name).join(", ") || "none"})`);
    log(`cap: $${dailyCap}/day · spent today: $${spendToday().toFixed(4)}`);
    if (ex.ready) log(`extraction: ${ex.provider} · ${ex.model}`);
    else log(`extraction DISABLED — ${ex.reason}. Mentions will be empty, visibility stays 0%.`);
    if (!brands.some((b) => (b as { is_self?: number }).is_self))
      log("WARNING: no brand marked as yours — visibility cannot be computed.");

    for (const prompt of prompts) {
      log(`prompt: "${prompt.text.slice(0, 70)}${prompt.text.length > 70 ? "…" : ""}"`);
      for (let s = 0; s < samples; s++) {
        // ── open-core engines ──
        for (const engine of engines) {
          if (spendToday() >= dailyCap) {
            log(`STOPPED — daily cap $${dailyCap} reached`);
            summary.stoppedByCap = true;
            return finish(summary);
          }
          await executeOne(db, prompt.id, engine.id, s, () => engine.run(prompt.text), brands, selfDoms, summary);
        }
        // ── paid engine (skipped cleanly in the public build) ──
        if (overview) {
          if (spendToday() >= dailyCap) {
            summary.stoppedByCap = true;
            return finish(summary);
          }
          await executeOne(db, prompt.id, "ai_overviews", s, () => overview.run(prompt.text), brands, selfDoms, summary);
        }
      }
    }

    return finish(summary);
  } finally {
    _running = false;
  }
}

async function executeOne(
  db: ReturnType<typeof getDb>,
  promptId: string,
  engineId: string,
  sampleIdx: number,
  call: () => Promise<EngineResult>,
  brands: { id: string; name: string }[],
  selfDoms: string[],
  summary: RunSummary
): Promise<void> {
  const runId = randomUUID();
  try {
    const result = await call();

    let cost = result.costUsd;

    // Mentions via one cheap LLM call. Failure here is non-fatal — citations still land — but
    // it must be LOUD: silent extraction failure looks identical to "no brands mentioned".
    let mentions: { brand_id: string; position: number | null }[] = [];
    try {
      const ex = await extractMentions(result.text, brands);
      mentions = ex.mentions;
      cost += ex.costUsd;
    } catch (err) {
      log(`  extraction failed: ${String(err).slice(0, 200)}`);
    }

    log(
      `  ${engineId} s${sampleIdx}: ${result.text.length} chars, ` +
        `${result.citations.length} citation(s), ${mentions.length} mention(s), $${cost.toFixed(5)}`
    );

    const insertRun = db.prepare(
      "INSERT INTO run (id, prompt_id, engine, sample_idx, raw_text, cost_usd) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertCitation = db.prepare(
      "INSERT INTO citation (id, run_id, url, domain, is_self) VALUES (?, ?, ?, ?, ?)"
    );
    const insertMention = db.prepare(
      "INSERT INTO mention (id, run_id, brand_id, position) VALUES (?, ?, ?, ?)"
    );

    db.transaction(() => {
      insertRun.run(runId, promptId, engineId, sampleIdx, result.text, cost);
      for (const c of result.citations) {
        const isSelf = selfDoms.includes(c.domain) ? 1 : 0;
        insertCitation.run(randomUUID(), runId, c.url, c.domain, isSelf);
      }
      for (const m of mentions) {
        insertMention.run(randomUUID(), runId, m.brand_id, m.position);
      }
    })();

    summary.runs++;
    summary.costUsd += cost;
  } catch (err) {
    log(`  ${engineId} s${sampleIdx}: FAILED — ${String(err).slice(0, 220)}`);
    db.prepare(
      "INSERT INTO run (id, prompt_id, engine, sample_idx, error) VALUES (?, ?, ?, ?, ?)"
    ).run(runId, promptId, engineId, sampleIdx, String(err));
    summary.errors++;
  }
}

function finish(summary: RunSummary): RunSummary {
  summary.finished = new Date().toISOString();
  log(
    `done — ${summary.runs} ok, ${summary.errors} failed, $${summary.costUsd.toFixed(5)}` +
      (summary.stoppedByCap ? " (stopped by spend cap)" : "")
  );
  return summary;
}

function envInt(key: string, fallback: number): number {
  const n = parseInt(process.env[key] ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}
function envFloat(key: string, fallback: number): number {
  const n = parseFloat(process.env[key] ?? "");
  return Number.isFinite(n) ? n : fallback;
}

// lib/data.ts — typed data-access helpers over the SQLite schema (lib/db.ts).
// Used by the runner, the API routes, and the dashboard queries. Kept deliberately thin.
import { randomUUID } from "crypto";
import { getDb } from "./db";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Brand {
  id: string;
  name: string;
  is_self: number;
  domains: string[];
  created_at: string;
  description: string | null;
  industry: string | null;
  adjectives: string[];
  products: string[];
  url: string | null;
}

/** Optional brand-context fields the onboarding wizard drafts and the user can edit. */
export interface BrandProfileInput {
  description?: string | null;
  industry?: string | null;
  adjectives?: string[];
  products?: string[];
  url?: string | null;
}
export interface Prompt {
  id: string;
  text: string;
  tags: string[];
  active: number;
  created_at: string;
}

// ── Brands ───────────────────────────────────────────────────────────────────
export function listBrands(): Brand[] {
  const rows = getDb().prepare("SELECT * FROM brand ORDER BY is_self DESC, name").all() as any[];
  return rows.map(hydrateBrand);
}
export function getSelfBrand(): Brand | null {
  const row = getDb().prepare("SELECT * FROM brand WHERE is_self = 1 LIMIT 1").get() as any;
  return row ? hydrateBrand(row) : null;
}
export function createBrand(
  name: string,
  isSelf: boolean,
  domains: string[],
  profile: BrandProfileInput = {}
): Brand {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO brand (id, name, is_self, domains, description, industry, adjectives, products, url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      name,
      isSelf ? 1 : 0,
      JSON.stringify(domains),
      profile.description ?? null,
      profile.industry ?? null,
      JSON.stringify(profile.adjectives ?? []),
      JSON.stringify(profile.products ?? []),
      profile.url ?? null
    );
  return listBrands().find((b) => b.id === id)!;
}
export function deleteBrand(id: string): void {
  getDb().prepare("DELETE FROM brand WHERE id = ?").run(id);
}
function hydrateBrand(row: any): Brand {
  return {
    ...row,
    domains: safeJson(row.domains, []),
    adjectives: safeJson(row.adjectives ?? "[]", []),
    products: safeJson(row.products ?? "[]", []),
  };
}

/** All domains (lowercased) that belong to the self brand — used to mark citations is_self. */
export function selfDomains(): string[] {
  const self = getSelfBrand();
  return (self?.domains ?? []).map((d) => d.toLowerCase().replace(/^www\./, ""));
}

// ── Prompts ──────────────────────────────────────────────────────────────────
export function listPrompts(activeOnly = false): Prompt[] {
  const sql = activeOnly
    ? "SELECT * FROM prompt WHERE active = 1 ORDER BY created_at"
    : "SELECT * FROM prompt ORDER BY created_at";
  const rows = getDb().prepare(sql).all() as any[];
  return rows.map(hydratePrompt);
}
export function createPrompt(text: string, tags: string[]): Prompt {
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO prompt (id, text, tags) VALUES (?, ?, ?)")
    .run(id, text, JSON.stringify(tags));
  return listPrompts().find((p) => p.id === id)!;
}
export function setPromptActive(id: string, active: boolean): void {
  getDb().prepare("UPDATE prompt SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
}
export function deletePrompt(id: string): void {
  getDb().prepare("DELETE FROM prompt WHERE id = ?").run(id);
}
function hydratePrompt(row: any): Prompt {
  return { ...row, tags: safeJson(row.tags, []) };
}

// ── Settings (key/value) ──────────────────────────────────────────────────────
export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM setting WHERE key = ?").get(key) as any;
  return row?.value ?? null;
}
export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO setting (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .run(key, value);
}
export function getNumberSetting(key: string, fallback: number): number {
  const v = getSetting(key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Dashboard queries ─────────────────────────────────────────────────────────

/** Spend accumulated today (UTC), for the daily cap guardrail. */
export function spendToday(): number {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) AS s FROM run WHERE date(created_at) = date('now')"
    )
    .get() as any;
  return row.s as number;
}

export interface EngineCost {
  engine: string;
  /** How many priced calls this is based on — small n means treat the number loosely. */
  samples: number;
  avgCostUsd: number;
  minCostUsd: number;
  maxCostUsd: number;
}

export interface CostEstimate {
  /** Engines with enough history to price. */
  perEngine: EngineCost[];
  /** Active engines we've never successfully priced — the estimate excludes them. */
  unpriced: string[];
  prompts: number;
  samples: number;
  callsPerRun: number;
  /** null when nothing is priced yet: better no number than a fabricated one. */
  perRunUsd: number | null;
  perMonthUsd: number | null;
}

/**
 * Observed cost per call, per engine, from real runs.
 *
 * Excludes cost_usd = 0. Those are either failures or — the reason this filter exists — runs
 * recorded before cost reporting worked. Averaging them in understated the true figure by 40%.
 */
export function engineCosts(engines: string[]): EngineCost[] {
  if (!engines.length) return [];
  const holes = engines.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT engine,
              COUNT(*)      AS samples,
              AVG(cost_usd) AS avgCostUsd,
              MIN(cost_usd) AS minCostUsd,
              MAX(cost_usd) AS maxCostUsd
         FROM run
        WHERE error IS NULL AND cost_usd > 0 AND engine IN (${holes})
        GROUP BY engine`
    )
    .all(...engines) as EngineCost[];
}

/**
 * What the next run will cost, and what daily monitoring costs per month.
 *
 * Priced from this install's own history rather than hardcoded rates — model pricing changes,
 * answer lengths vary, and the web-search fee dominates in ways a static table won't capture.
 */
export function estimateCost(
  engines: string[],
  promptCount: number,
  samples: number,
  runsPerDay = 1
): CostEstimate {
  const perEngine = engineCosts(engines);
  const priced = new Set(perEngine.map((e) => e.engine));
  const unpriced = engines.filter((e) => !priced.has(e));

  const costPerSampleAcrossEngines = perEngine.reduce((sum, e) => sum + e.avgCostUsd, 0);
  const known = perEngine.length > 0;
  const perRunUsd = known ? costPerSampleAcrossEngines * promptCount * samples : null;

  return {
    perEngine,
    unpriced,
    prompts: promptCount,
    samples,
    callsPerRun: promptCount * samples * engines.length,
    perRunUsd,
    perMonthUsd: perRunUsd === null ? null : perRunUsd * runsPerDay * 30,
  };
}

export interface RunFailure {
  engine: string;
  error: string;
  count: number;
  last_at: string;
}

/**
 * Failures from engines that are STILL failing — grouped by engine + message.
 *
 * A failing run is stored, not thrown, so without this the dashboard looks empty and the user
 * concludes "nothing happened". But a plain 24h window is worse than useless — it keeps
 * accusing after the problem is fixed. Two filters keep it honest:
 *
 *   1. `liveEngines` — only engines that still exist. Changing a model retires an engine id;
 *      its old failures are history, not a current problem.
 *   2. the NOT EXISTS — an engine that has succeeded since is working now.
 */
export function recentFailures(liveEngines: string[], limit = 5): RunFailure[] {
  if (!liveEngines.length) return [];
  const holes = liveEngines.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT f.engine, f.error, COUNT(*) AS count, MAX(f.created_at) AS last_at
         FROM run f
        WHERE f.error IS NOT NULL
          AND f.created_at >= datetime('now', '-1 day')
          AND f.engine IN (${holes})
          AND NOT EXISTS (
                SELECT 1 FROM run ok
                 WHERE ok.engine = f.engine
                   AND ok.error IS NULL
                   AND ok.created_at > f.created_at
              )
        GROUP BY f.engine, f.error
        ORDER BY last_at DESC
        LIMIT ?`
    )
    .all(...liveEngines, limit) as RunFailure[];
}

/** Visibility per engine = share of runs (last N days) in which the self brand was mentioned. */
export function visibilityByEngine(days = 30): { engine: string; visibility: number; runs: number }[] {
  return getDb()
    .prepare(
      `SELECT r.engine AS engine,
              COUNT(*) AS runs,
              SUM(CASE WHEN EXISTS (
                    SELECT 1 FROM mention m JOIN brand b ON b.id = m.brand_id
                    WHERE m.run_id = r.id AND b.is_self = 1
                  ) THEN 1 ELSE 0 END) AS hits
         FROM run r
        WHERE r.error IS NULL AND r.created_at >= datetime('now', ?)
        GROUP BY r.engine`
    )
    .all(`-${days} days`)
    .map((row: any) => ({
      engine: row.engine,
      runs: row.runs,
      visibility: row.runs ? row.hits / row.runs : 0,
    }));
}

/** Share of voice: mention counts per brand across recent runs. */
export function shareOfVoice(days = 30): { brand_id: string; name: string; is_self: number; mentions: number }[] {
  return getDb()
    .prepare(
      `SELECT b.id AS brand_id, b.name AS name, b.is_self AS is_self, COUNT(m.id) AS mentions
         FROM brand b
         LEFT JOIN mention m ON m.brand_id = b.id
         LEFT JOIN run r ON r.id = m.run_id AND r.created_at >= datetime('now', ?)
        GROUP BY b.id
        ORDER BY mentions DESC`
    )
    .all(`-${days} days`) as any[];
}

/** Daily self-visibility trend (fraction of runs mentioning us), for the overview line chart. */
export function visibilityTrend(days = 30): { day: string; visibility: number }[] {
  return getDb()
    .prepare(
      `SELECT date(r.created_at) AS day,
              CAST(SUM(CASE WHEN EXISTS (
                    SELECT 1 FROM mention m JOIN brand b ON b.id = m.brand_id
                    WHERE m.run_id = r.id AND b.is_self = 1
                  ) THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS visibility
         FROM run r
        WHERE r.error IS NULL AND r.created_at >= datetime('now', ?)
        GROUP BY day ORDER BY day`
    )
    .all(`-${days} days`) as any[];
}

/** Per-prompt × engine mention rate (of the self brand), for the Prompts view. */
export function promptEngineRates(days = 30): { prompt_id: string; engine: string; rate: number; samples: number }[] {
  return getDb()
    .prepare(
      `SELECT r.prompt_id AS prompt_id, r.engine AS engine,
              COUNT(*) AS samples,
              CAST(SUM(CASE WHEN EXISTS (
                    SELECT 1 FROM mention m JOIN brand b ON b.id = m.brand_id
                    WHERE m.run_id = r.id AND b.is_self = 1
                  ) THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS rate
         FROM run r
        WHERE r.error IS NULL AND r.created_at >= datetime('now', ?)
        GROUP BY r.prompt_id, r.engine`
    )
    .all(`-${days} days`) as any[];
}

/** Which of OUR URLs got cited, how often, for which prompts/engines. The headline view. */
export function selfCitations(days = 30): {
  url: string;
  domain: string;
  engine: string;
  prompt_id: string;
  prompt_text: string;
  count: number;
}[] {
  return getDb()
    .prepare(
      `SELECT c.url AS url, c.domain AS domain, r.engine AS engine,
              r.prompt_id AS prompt_id, p.text AS prompt_text, COUNT(*) AS count
         FROM citation c
         JOIN run r ON r.id = c.run_id
         JOIN prompt p ON p.id = r.prompt_id
        WHERE c.is_self = 1 AND r.created_at >= datetime('now', ?)
        GROUP BY c.url, r.engine, r.prompt_id
        ORDER BY count DESC`
    )
    .all(`-${days} days`) as any[];
}

/** Recent runs for a prompt (drill-down): raw text + citation domains. */
export interface RunDetail {
  id: string;
  engine: string;
  sample_idx: number;
  answer: string;
  cost_usd: number;
  error: string | null;
  created_at: string;
  citations: { url: string; domain: string; is_self: number }[];
  mentions: { brand_id: string; name: string; is_self: number; position: number | null }[];
}

export interface PromptDetail {
  prompt: Prompt | null;
  runs: RunDetail[];
  /** Domains cited for this prompt, most-cited first — the actionable "who owns this answer". */
  topDomains: { domain: string; citations: number; is_self: number }[];
}

/**
 * Everything behind one prompt: the answers themselves, what was cited, who was named.
 *
 * Aggregates alone are useless at 0% visibility — every number is zero and the user learns
 * nothing. Reading the actual answer is how you find out which competitors own the response
 * and which pages the model trusts.
 */
export function promptDetail(promptId: string, limit = 20): PromptDetail {
  const db = getDb();

  const prompt = db.prepare("SELECT * FROM prompt WHERE id = ?").get(promptId) as
    | Record<string, unknown>
    | undefined;

  const runs = db
    .prepare(
      `SELECT id, engine, sample_idx, raw_text, cost_usd, error, created_at
         FROM run WHERE prompt_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(promptId, limit) as {
    id: string;
    engine: string;
    sample_idx: number;
    raw_text: string;
    cost_usd: number;
    error: string | null;
    created_at: string;
  }[];

  const citationsFor = db.prepare(
    "SELECT url, domain, is_self FROM citation WHERE run_id = ? ORDER BY rowid"
  );
  const mentionsFor = db.prepare(
    `SELECT m.brand_id, b.name, b.is_self, m.position
       FROM mention m JOIN brand b ON b.id = m.brand_id
      WHERE m.run_id = ? ORDER BY COALESCE(m.position, 999)`
  );

  const topDomains = db
    .prepare(
      `SELECT c.domain, COUNT(*) AS citations, MAX(c.is_self) AS is_self
         FROM citation c JOIN run r ON r.id = c.run_id
        WHERE r.prompt_id = ?
        GROUP BY c.domain
        ORDER BY citations DESC, c.domain
        LIMIT 15`
    )
    .all(promptId) as { domain: string; citations: number; is_self: number }[];

  return {
    prompt: prompt ? hydratePrompt(prompt) : null,
    topDomains,
    runs: runs.map((r) => ({
      id: r.id,
      engine: r.engine,
      sample_idx: r.sample_idx,
      answer: r.raw_text,
      cost_usd: r.cost_usd,
      error: r.error,
      created_at: r.created_at,
      citations: citationsFor.all(r.id) as RunDetail["citations"],
      mentions: mentionsFor.all(r.id) as RunDetail["mentions"],
    })),
  };
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

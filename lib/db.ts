// lib/db.ts — SQLite connection + ALL schema/migrations.
//
// IRON RULE (see docs/OPEN_CORE.md): every CREATE TABLE / ALTER TABLE lives HERE, even for
// tables only paid (ee/) features use. Migrations NEVER move into ee/ — a stripped public
// build must still migrate cleanly. Unused tables/columns in the public build are harmless.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DATABASE_PATH || "./data/app.db";
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);

  _db = db;
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    -- Brands: the self brand (is_self=1) plus tracked competitors.
    CREATE TABLE IF NOT EXISTS brand (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      is_self    INTEGER NOT NULL DEFAULT 0,   -- 1 = us, 0 = competitor
      domains    TEXT NOT NULL DEFAULT '[]',   -- JSON array of domains we own/track
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- The tracked prompt set.
    CREATE TABLE IF NOT EXISTS prompt (
      id         TEXT PRIMARY KEY,
      text       TEXT NOT NULL,
      tags       TEXT NOT NULL DEFAULT '[]',   -- JSON array: persona / funnel-stage tags
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One execution of a prompt against one engine (one of N samples).
    CREATE TABLE IF NOT EXISTS run (
      id         TEXT PRIMARY KEY,
      prompt_id  TEXT NOT NULL REFERENCES prompt(id) ON DELETE CASCADE,
      engine     TEXT NOT NULL,                -- 'perplexity' | 'openai' | 'gemini' | (ee) 'ai_overviews'
      sample_idx INTEGER NOT NULL DEFAULT 0,   -- 0..N-1 for non-determinism sampling
      raw_text   TEXT NOT NULL DEFAULT '',     -- the model's answer
      cost_usd   REAL NOT NULL DEFAULT 0,
      error      TEXT,                         -- non-null if this run failed
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_run_prompt   ON run(prompt_id);
    CREATE INDEX IF NOT EXISTS idx_run_engine   ON run(engine);
    CREATE INDEX IF NOT EXISTS idx_run_created  ON run(created_at);

    -- A brand mention detected in a run's answer.
    CREATE TABLE IF NOT EXISTS mention (
      id         TEXT PRIMARY KEY,
      run_id     TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
      brand_id   TEXT NOT NULL REFERENCES brand(id) ON DELETE CASCADE,
      position   INTEGER                       -- rank/order in the answer, if determinable
    );
    CREATE INDEX IF NOT EXISTS idx_mention_run   ON mention(run_id);
    CREATE INDEX IF NOT EXISTS idx_mention_brand ON mention(brand_id);

    -- A URL cited as a source in a run. is_self=1 if the domain is one of ours.
    CREATE TABLE IF NOT EXISTS citation (
      id         TEXT PRIMARY KEY,
      run_id     TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      domain     TEXT NOT NULL,
      is_self    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_citation_run    ON citation(run_id);
    CREATE INDEX IF NOT EXISTS idx_citation_domain ON citation(domain);

    -- Simple key/value settings (spend caps, sample count, cadence overrides).
    CREATE TABLE IF NOT EXISTS setting (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Provider credentials, added through the UI. api_key_enc is AES-256-GCM ciphertext
    -- (see lib/crypto.ts) — plaintext keys are NEVER stored here and never leave the server.
    CREATE TABLE IF NOT EXISTS provider (
      id          TEXT PRIMARY KEY,             -- engine id: 'openrouter' | 'perplexity' | ...
      api_key_enc TEXT,                         -- NULL = configured by env var instead
      model       TEXT,                         -- optional single-model override
      enabled     INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Accounts that can log into this instance (see lib/auth.ts). Single-tenant: every user
    -- sees the same one shared dataset above — no per-user scoping, no workspace concept.
    CREATE TABLE IF NOT EXISTS user (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,             -- scrypt: 'scrypt$N$r$p$saltHex$hashHex'
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // A multi-model provider (OpenRouter) tracks several models at once, each becoming its own
  // engine. JSON array of model ids; NULL/[] falls back to the single `model` column.
  addColumn(db, "provider", "models", "TEXT");

  // Brand-context profile, drafted by the onboarding wizard's scrape + LLM agent step and
  // editable by the user. Only meaningful on the self brand (is_self=1).
  addColumn(db, "brand", "description", "TEXT");
  addColumn(db, "brand", "industry", "TEXT");
  addColumn(db, "brand", "adjectives", "TEXT"); // JSON array
  addColumn(db, "brand", "products", "TEXT");   // JSON array
  addColumn(db, "brand", "url", "TEXT");        // the scraped source URL
}

/** CREATE TABLE IF NOT EXISTS won't add columns to an existing table; this does, idempotently. */
function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// lib/providers.ts — provider credentials, added through the UI and encrypted at rest.
//
// Adapters call providerKey(id) instead of reading process.env directly. The DB wins; env
// stays as a fallback so Docker/CI deployments can inject keys without touching the UI.
//
// Plaintext keys leave this module only toward the provider's API — never to an HTTP response.
// The UI gets describeProviders(), which returns a masked hint and nothing more.

import { getDb } from "./db";
import { encrypt, decrypt } from "./crypto";

/** Env var consulted when a provider has no key stored in the DB. */
const ENV_FALLBACK: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const ENV_MODEL_FALLBACK: Record<string, string> = {
  openrouter: "OPENROUTER_MODEL",
};

interface ProviderRow {
  id: string;
  api_key_enc: string | null;
  model: string | null;
  models: string | null; // JSON array, multi-model providers only
  enabled: number;
}

function row(id: string): ProviderRow | undefined {
  return getDb().prepare("SELECT * FROM provider WHERE id = ?").get(id) as ProviderRow | undefined;
}

/** The usable API key for a provider: DB first, then env. null when unconfigured. */
export function providerKey(id: string): string | null {
  const r = row(id);
  if (r && !r.enabled) return null; // explicitly disabled in the UI
  const stored = decrypt(r?.api_key_enc);
  if (stored) return stored;
  const envName = ENV_FALLBACK[id];
  return (envName && process.env[envName]?.trim()) || null;
}

/** Optional per-provider model override, else the caller's default. */
export function providerModel(id: string, fallback: string): string {
  const stored = row(id)?.model?.trim();
  if (stored) return stored;
  const envName = ENV_MODEL_FALLBACK[id];
  return (envName && process.env[envName]?.trim()) || fallback;
}

export function isProviderConfigured(id: string): boolean {
  return providerKey(id) !== null;
}

/**
 * Models selected for a multi-model provider. Each one is tracked as its own engine, so a
 * single OpenRouter key can cover ChatGPT, Claude, Gemini and Perplexity side by side.
 */
export function selectedModels(id: string): string[] {
  const raw = row(id)?.models;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === "string" && m) : [];
  } catch {
    return [];
  }
}

export function setSelectedModels(id: string, models: string[]): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO provider (id) VALUES (?)").run(id);
  const clean = [...new Set(models.filter((m) => typeof m === "string" && m.trim()))].map((m) =>
    m.trim()
  );
  db.prepare("UPDATE provider SET models = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(clean),
    id
  );
}

export interface ProviderStatus {
  id: string;
  configured: boolean;
  /** Where the active key came from — env keys can't be edited or deleted in the UI. */
  source: "db" | "env" | "none";
  /**
   * A key is stored but won't decrypt — the master key changed or data/.secret was lost.
   * Without this the provider just reads as "not connected" and the engine silently vanishes.
   */
  undecryptable: boolean;
  /** Last 4 characters only, for "is this the key I think it is?". Never the full key. */
  hint: string | null;
  model: string | null;
  models: string[];
  enabled: boolean;
}

/** Safe-to-serialize status for every known provider. Contains NO secret material. */
export function describeProviders(): ProviderStatus[] {
  return Object.keys(ENV_FALLBACK).map((id) => {
    const r = row(id);
    const stored = decrypt(r?.api_key_enc);
    const envKey = process.env[ENV_FALLBACK[id]]?.trim() || null;
    const active = stored ?? envKey;

    return {
      id,
      configured: !!active && r?.enabled !== 0,
      source: stored ? "db" : envKey ? "env" : "none",
      undecryptable: !!r?.api_key_enc && stored === null,
      hint: active ? `…${active.slice(-4)}` : null,
      model: r?.model ?? null,
      models: selectedModels(id),
      enabled: r?.enabled !== 0,
    };
  });
}

export function isKnownProvider(id: string): boolean {
  return id in ENV_FALLBACK;
}

/**
 * The model column is NOT encrypted and IS returned to the browser, so an API key pasted into
 * it leaks in plaintext. Two adjacent inputs make that an easy slip — reject it at the door.
 */
const KEY_SHAPED = /^(sk-|pplx-|AIza|sk-or-)/i;

export function looksLikeApiKey(value: string): boolean {
  const v = value.trim();
  return KEY_SHAPED.test(v) || v.length > 60;
}

/** Store/replace a provider's key and/or model. Pass apiKey: null to leave the key untouched. */
export function saveProvider(
  id: string,
  { apiKey, model, enabled }: { apiKey?: string | null; model?: string | null; enabled?: boolean }
): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO provider (id) VALUES (?)").run(id);

  if (apiKey != null) {
    const trimmed = apiKey.trim();
    db.prepare("UPDATE provider SET api_key_enc = ?, updated_at = datetime('now') WHERE id = ?")
      .run(trimmed ? encrypt(trimmed) : null, id);
  }
  if (model !== undefined) {
    const m = model?.trim() || null;
    if (m && looksLikeApiKey(m)) {
      throw new Error("That looks like an API key, not a model name — put it in the key field.");
    }
    db.prepare("UPDATE provider SET model = ?, updated_at = datetime('now') WHERE id = ?")
      .run(m, id);
  }
  if (enabled !== undefined) {
    db.prepare("UPDATE provider SET enabled = ?, updated_at = datetime('now') WHERE id = ?")
      .run(enabled ? 1 : 0, id);
  }
}

/** Forget a provider's stored key. An env-var key, if present, becomes active again. */
export function deleteProviderKey(id: string): void {
  getDb()
    .prepare("UPDATE provider SET api_key_enc = NULL, updated_at = datetime('now') WHERE id = ?")
    .run(id);
}

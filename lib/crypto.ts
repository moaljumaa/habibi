// lib/crypto.ts — AES-256-GCM for provider API keys at rest.
//
// The master key must NOT live in the database it protects, or encryption buys nothing.
// Resolution order:
//   1. HABIBI_SECRET_KEY env var (64 hex chars) — use this in Docker/prod.
//   2. data/.secret, auto-generated on first boot — zero-config for a local self-hoster.
//
// Losing the master key means the stored provider keys are unrecoverable; that's the intent.
// Re-enter them in Settings and they're re-encrypted under the new one.

import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;   // GCM standard nonce
const TAG_BYTES = 16;

let _key: Buffer | null = null;

function masterKey(): Buffer {
  if (_key) return _key;

  const fromEnv = process.env.HABIBI_SECRET_KEY?.trim();
  if (fromEnv) {
    if (!/^[0-9a-f]{64}$/i.test(fromEnv)) {
      throw new Error("HABIBI_SECRET_KEY must be 64 hex characters (32 bytes)");
    }
    _key = Buffer.from(fromEnv, "hex");
    return _key;
  }

  const dbPath = process.env.DATABASE_PATH || "./data/app.db";
  const secretPath = path.join(path.dirname(dbPath), ".secret");

  if (fs.existsSync(secretPath)) {
    _key = Buffer.from(fs.readFileSync(secretPath, "utf8").trim(), "hex");
    return _key;
  }

  const generated = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  // mode 0600: owner-only. No-op on Windows, correct everywhere else.
  fs.writeFileSync(secretPath, generated.toString("hex"), { mode: 0o600 });
  _key = generated;
  return _key;
}

/** Encrypt a plaintext secret. Returns base64 of iv || tag || ciphertext. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

/** Decrypt a value produced by encrypt(). Returns null if absent, tampered, or wrong key. */
export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(buf.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null; // GCM auth failure — tampered ciphertext or rotated master key
  }
}

/**
 * A key derived from the master key for a specific purpose (HMAC label), so one secret
 * (HABIBI_SECRET_KEY / data/.secret) can safely back more than one use — e.g. provider-key
 * encryption here and session-cookie signing in lib/auth.ts — without sharing raw key material.
 */
export function deriveKey(label: string): Buffer {
  return crypto.createHmac("sha256", masterKey()).update(label).digest();
}

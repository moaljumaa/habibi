// lib/auth.ts — single-tenant login: password hashing, signed session cookies, current-user
// lookup. No per-user data scoping, no workspace concept — every account sees the same one
// shared instance. No session table: the cookie itself is the session (stateless, HMAC-signed).

import crypto, { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { getDb } from "./db";
import { deriveKey } from "./crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export const SESSION_COOKIE_NAME = "habibi_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface User {
  id: string;
  email: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

function row(email: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM user WHERE email = ?")
    .get(email.trim().toLowerCase()) as UserRow | undefined;
}

/** Anyone who knows HABIBI_SIGNUP_SECRET can create their own account, at any time — this
 *  gates signup, not "first run". Unset ⇒ signup is always rejected (safe default: an
 *  operator who hasn't configured it hasn't opted in to letting anyone sign up). */
export function verifySignupSecret(candidate: string): boolean {
  const expected = process.env.HABIBI_SIGNUP_SECRET;
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** 'scrypt$N$r$p$saltHex$hashHex' — params embedded so future tuning doesn't break old hashes. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function createUser(email: string, password: string): User {
  const id = randomUUID();
  const normalizedEmail = email.trim().toLowerCase();
  getDb()
    .prepare("INSERT INTO user (id, email, password_hash) VALUES (?, ?, ?)")
    .run(id, normalizedEmail, hashPassword(password));
  return { id, email: normalizedEmail };
}

export function findUserByEmail(email: string): User | null {
  const r = row(email);
  return r ? { id: r.id, email: r.email } : null;
}

export function findUserById(id: string): User | null {
  const r = getDb().prepare("SELECT * FROM user WHERE id = ?").get(id) as UserRow | undefined;
  return r ? { id: r.id, email: r.email } : null;
}

/** Returns the matching user if the password is correct, else null. Same failure for both
 *  "no such user" and "wrong password" — the caller must not distinguish them in its response. */
export function verifyCredentials(email: string, password: string): User | null {
  const r = row(email);
  if (!r || !verifyPassword(password, r.password_hash)) return null;
  return { id: r.id, email: r.email };
}

function sessionKey(): Buffer {
  return deriveKey("habibi-session-v1");
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/** payload.exp isn't secret — signing (not encrypting) is enough to make it tamper-evident. */
export function createSessionToken(userId: string): string {
  const payload = JSON.stringify({
    uid: userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });
  const body = base64url(Buffer.from(payload, "utf8"));
  const sig = base64url(crypto.createHmac("sha256", sessionKey()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expectedSig = base64url(crypto.createHmac("sha256", sessionKey()).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      uid: string;
      exp: number;
    };
    if (typeof payload.uid !== "string" || Date.now() > payload.exp) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

function cookieAttrs(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function setSessionCookie(userId: string): string {
  const token = createSessionToken(userId);
  return `${SESSION_COOKIE_NAME}=${token}; Max-Age=${SESSION_MAX_AGE_SECONDS}; ${cookieAttrs()}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; ${cookieAttrs()}`;
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

/** Current user for a Node-shaped request (API routes). Re-verifies the cookie itself — never
 *  trust that middleware already checked it, since a route could be reached another way. */
export function userFromRequest(req: IncomingMessage): User | null {
  const token = parseCookie(req.headers.cookie, SESSION_COOKIE_NAME);
  const uid = verifySessionToken(token);
  return uid ? findUserById(uid) : null;
}

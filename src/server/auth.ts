/**
 * Auth — token generation, persistence, and verification.
 *
 * The server authenticates every request via a 32-byte random token
 * stored at `~/.pilot/server.token` (chmod 600). The token is created
 * on first server start and reused thereafter.
 *
 * Format: URL-safe base64 (no padding), 43 chars from 32 bytes.
 *
 * The token is NOT meant to be human-typed. The CLI prints it once at
 * startup; the Web UI persists it to localStorage on first load.
 */

import { randomBytes } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pilotDir } from '../core/types.js';

/** Header name carrying the auth token. */
export const TOKEN_HEADER = 'x-pilot-token';

/** Absolute path to the persisted token file. */
export function tokenPath(home?: string): string {
  return `${pilotDir(home)}/server.token`;
}

/** Generate a fresh 32-byte URL-safe token. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Read the persisted token, or create + persist a new one.
 *
 * The file is created with mode 0600 (owner read/write only).
 *
 * @returns The token string.
 */
export async function readOrCreateToken(home?: string): Promise<string> {
  const file = tokenPath(home);
  if (existsSync(file)) {
    return readFile(file, 'utf-8');
  }
  const token = generateToken();
  await writeFile(file, token, { encoding: 'utf-8', mode: 0o600 });
  // Mode from options isn't honored on all platforms; chmod explicitly.
  await chmod(file, 0o600);
  return token;
}

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Verify a request's token header against the expected token. */
export function verifyToken(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

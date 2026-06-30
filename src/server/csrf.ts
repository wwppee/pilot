/**
 * CSRF — double-submit cookie pattern.
 *
 * Flow:
 *   1. Client makes a GET request (no CSRF token yet).
 *   2. Server generates a random CSRF token, sets it as `pilot-csrf` cookie
 *      AND returns it in the response body (`X-Pilot-CSRF` header).
 *   3. Client (Web UI) reads the header, stores in memory.
 *   4. Client makes a POST: browser auto-sends the cookie. The Web UI
 *      must also send the CSRF token in the `X-Pilot-CSRF` header.
 *   5. Server compares cookie value vs. header value. If they match,
 *      request is genuine (a cross-origin attacker can't read the header).
 *
 * The CSRF token is regenerated on server start (in-memory only — not
 * persisted). Token is bound to the auth token, not the user (we only
 * have one user — the local machine owner).
 */

import { randomBytes } from 'node:crypto';

/** Header name carrying the CSRF token on POST. */
export const CSRF_HEADER = 'x-pilot-csrf';

/** Cookie name carrying the CSRF token. */
export const CSRF_COOKIE = 'pilot-csrf';

/** Generate a fresh CSRF token. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * State held by the server. Created at startup, used to issue + verify
 * tokens throughout the server's lifetime.
 */
export class CsrfState {
  private current: string;

  constructor() {
    this.current = generateCsrfToken();
  }

  /** Returns the current CSRF token. The server sets this as cookie + header on every response. */
  getToken(): string {
    return this.current;
  }

  /**
   * Verify a POST request's CSRF token.
   * Both the cookie value and the header value must match the server's current token.
   */
  verify(cookieValue: string | undefined, headerValue: string | undefined): boolean {
    if (!cookieValue || !headerValue) return false;
    return cookieValue === headerValue && cookieValue === this.current;
  }
}

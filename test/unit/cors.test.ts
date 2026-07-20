/**
 * Tests for src/server/cors.ts.
 *
 * v0.9.16: allowedOriginsFor extracted from server.ts.
 * The set returned is matched against the request's
 * `Origin` header inside the onRequest hook — a
 * browser request with a non-matching origin is
 * rejected with 403 before the route handler runs.
 *
 * Loopback aliases (127.0.0.1 / 0.0.0.0) should
 * also allow `localhost`, so the dev server is
 * reachable whether the user typed one or the
 * other in the address bar. Non-loopback hosts
 * should NOT have the localhost alias (it'd
 * open the door to same-origin-script attacks
 * on a public port).
 */

import { describe, it, expect } from "vitest";
import { allowedOriginsFor } from "../../src/server/cors.js";

describe("allowedOriginsFor", () => {
  it("includes http://<host>:<port> for a non-loopback host", () => {
    const origins = allowedOriginsFor("example.com", 8080);
    expect(origins.size).toBe(1);
    expect(origins.has("http://example.com:8080")).toBe(true);
  });

  it("includes the localhost alias for 127.0.0.1", () => {
    const origins = allowedOriginsFor("127.0.0.1", 17361);
    expect(origins.has("http://127.0.0.1:17361")).toBe(true);
    expect(origins.has("http://localhost:17361")).toBe(true);
  });

  it("includes the localhost alias for 0.0.0.0", () => {
    const origins = allowedOriginsFor("0.0.0.0", 17361);
    expect(origins.has("http://0.0.0.0:17361")).toBe(true);
    expect(origins.has("http://localhost:17361")).toBe(true);
  });

  it("does NOT add a localhost alias for non-loopback hosts", () => {
    // A public host must only allow its own origin;
    // adding localhost would let a malicious page
    // on localhost attack a public server.
    const origins = allowedOriginsFor("api.example.com", 443);
    expect(origins.has("http://api.example.com:443")).toBe(true);
    expect(origins.has("http://localhost:443")).toBe(false);
  });
});

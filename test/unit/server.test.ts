/**
 * Tests for pilot server.
 *
 * Verifies:
 *   - /health is unauthenticated
 *   - All other routes require X-Pilot-Token
 *   - Token mismatch returns 401
 *   - Write methods (POST) reject bad origin with 403
 *   - Write methods (POST) reject missing CSRF with 403
 *   - Write methods (POST) accept valid CSRF
 *   - Real service calls work (e.g. GET /packs returns [])
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../src/server/server.js";
import { VERSION } from "../../src/core/version.js";

describe("pilot server", () => {
  let handle: ServerHandle;
  let tempHome: string;
  let originalHome: string | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), "pilot-server-test-"));
    process.env.HOME = tempHome;
    mkdirSync(join(tempHome, ".pilot"), { recursive: true });

    handle = await startServer({
      home: tempHome,
      noListen: true, // we'll use app.inject()
    });
    // For inject(), use a relative URL prefix
    baseUrl = "/";
  });

  afterEach(async () => {
    await handle.close();
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  // ─── /health ──────────────────────────────────────

  describe("GET /health", () => {
    it("is unauthenticated", async () => {
      const res = await handle.app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.version).toBe(VERSION);
    });
  });

  // ─── Token auth ───────────────────────────────────

  describe("token auth", () => {
    it("rejects without token", async () => {
      const res = await handle.app.inject({ method: "GET", url: "/packs" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects wrong token", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/packs",
        headers: { "x-pilot-token": "wrong-token" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("accepts correct token", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/packs",
        headers: { "x-pilot-token": handle.token },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  // ─── GET routes ───────────────────────────────────

  describe("GET routes", () => {
    const auth = () => ({ "x-pilot-token": handle.token });

    it("GET /packs returns array", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/packs",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it("GET /sessions returns array", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/sessions",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it("GET /doctor returns report", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/doctor",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.ok).toBe("boolean");
      expect(Array.isArray(body.checks)).toBe(true);
    });

    it("GET /stats returns report", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/stats?range=lastDays&days=30",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("totalSessions");
      expect(body).toHaveProperty("totalMessages");
      expect(body).toHaveProperty("totalToolCalls");
      expect(Array.isArray(body.byModel)).toBe(true);
      expect(Array.isArray(body.byTool)).toBe(true);
      expect(Array.isArray(body.byDay)).toBe(true);
    });

    it("GET /stats defaults to week", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/stats",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("byDay");
    });

    it("GET /capabilities returns array", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/capabilities",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it("GET /sessions/search?q=foo returns array", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/sessions/search?q=foo",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });

    it("GET /packs/search with empty q returns []", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/packs/search",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("GET /packs/info/:name 404 for missing pack", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/packs/info/this-does-not-exist-9999",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    }, 15_000);

    it("GET /sessions/:id/tree returns session tree", async () => {
      // First create a real session file in our isolated home
      const encoded = Buffer.from("/tmp/fake-cwd").toString("base64");
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const sessionId = "2026-07-01_10-00_xyz";
      const sessionPath = join(sessionsDir, `${sessionId}.jsonl`);
      writeFileSync(
        sessionPath,
        [
          JSON.stringify({
            id: "a",
            type: "user",
            timestamp: "2026-07-01T10:00:00Z",
            data: { text: "q" },
          }),
          JSON.stringify({
            id: "b",
            parentId: "a",
            type: "assistant",
            timestamp: "2026-07-01T10:00:05Z",
            data: { model: "claude-opus-4.6", text: "a" },
          }),
        ].join("\n"),
      );

      const res = await handle.app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/tree`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalNodes).toBe(2);
      expect(body.models).toEqual(["claude-opus-4.6"]);
      expect(body.root.id).toBe("a");
    });

    it("GET /sessions/:id/tree 500s for missing session", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/sessions/does-not-exist/tree",
        headers: auth(),
      });
      // Service throws → server returns 500 (no custom error mapping yet)
      expect(res.statusCode).toBe(500);
    });
  });

  // ─── POST / write operations ──────────────────────

  describe("POST /packs/install (write operation)", () => {
    it("rejects without token", async () => {
      const res = await handle.app.inject({
        method: "POST",
        url: "/packs/install",
        payload: { source: "npm:foo" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects bad origin", async () => {
      const res = await handle.app.inject({
        method: "POST",
        url: "/packs/install",
        headers: {
          "x-pilot-token": handle.token,
          origin: "http://evil.example.com",
        },
        payload: { source: "npm:foo" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects missing source", async () => {
      // Use valid origin + CSRF (skipping because no origin = allow for scripts)
      const res = await handle.app.inject({
        method: "POST",
        url: "/packs/install",
        headers: { "x-pilot-token": handle.token },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects bad CSRF when origin is set (browser request)", async () => {
      const res = await handle.app.inject({
        method: "POST",
        url: "/packs/install",
        headers: {
          "x-pilot-token": handle.token,
          origin: "http://127.0.0.1:17361",
          // missing CSRF cookie + header
        },
        payload: { source: "npm:foo" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("accepts valid CSRF + origin", async () => {
      // First GET to set CSRF cookie
      const getRes = await handle.app.inject({
        method: "GET",
        url: "/health",
      });
      const csrfCookie = getRes.cookies.find((c) => c.name === "pilot-csrf");
      expect(csrfCookie).toBeDefined();
      const csrfHeader = getRes.headers["x-pilot-csrf"];
      expect(csrfHeader).toBeDefined();

      const res = await handle.app.inject({
        method: "POST",
        url: "/packs/install",
        headers: {
          "x-pilot-token": handle.token,
          origin: "http://127.0.0.1:17361",
          "x-pilot-csrf": csrfHeader as string,
          cookie: `pilot-csrf=${csrfCookie!.value}`,
        },
        payload: { source: "npm:definitely-not-real-pkg-zzz" },
      });
      // installPack will throw because the package doesn't exist
      // but we got past auth + CSRF, so status is 500 (not 401/403)
      expect([500]).toContain(res.statusCode);
    }, 30_000);
  });

  // ─── CSRF token behavior ──────────────────────────

  describe("CSRF token", () => {
    it("GET response includes x-pilot-csrf header and cookie", async () => {
      const res = await handle.app.inject({ method: "GET", url: "/health" });
      expect(res.headers["x-pilot-csrf"]).toBeDefined();
      const cookie = res.cookies.find((c) => c.name === "pilot-csrf");
      expect(cookie).toBeDefined();
    });
  });
});

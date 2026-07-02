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

  // ─── Policy routes (v0.4.3) ───────────────────────

  describe("Policy endpoints", () => {
    const auth = () => ({ "x-pilot-token": handle.token });

    it("full policy lifecycle: create → list → get → check → apply → unapply → delete", async () => {
      // 1. Empty list
      const empty = await handle.app.inject({
        method: "GET",
        url: "/policies",
        headers: auth(),
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual([]);

      // 2. Create
      const put = await handle.app.inject({
        method: "PUT",
        url: "/policies/safe-bash",
        headers: auth(),
        payload: {
          description: "test",
          allow: [],
          deny: ["bash"],
          denyPaths: ["**/.env"],
          denyCommands: ["^rm"],
          sensitivePatterns: ["sk-X+"],
          requireApproval: ["write"],
        },
      });
      expect(put.statusCode).toBe(200);
      const putBody = put.json() as { name: string; deny: string[] };
      expect(putBody.name).toBe("safe-bash");
      expect(putBody.deny).toEqual(["bash"]);

      // 3. List has it
      const list = await handle.app.inject({
        method: "GET",
        url: "/policies",
        headers: auth(),
      });
      expect(list.statusCode).toBe(200);
      expect(
        (list.json() as Array<{ name: string }>).map((p) => p.name),
      ).toEqual(["safe-bash"]);

      // 4. Get by name
      const get = await handle.app.inject({
        method: "GET",
        url: "/policies/safe-bash",
        headers: auth(),
      });
      expect(get.statusCode).toBe(200);
      expect((get.json() as { name: string }).name).toBe("safe-bash");

      // 5. Missing → 404
      const miss = await handle.app.inject({
        method: "GET",
        url: "/policies/missing",
        headers: auth(),
      });
      expect(miss.statusCode).toBe(404);

      // 6. Check blocks denied tool
      const check = await handle.app.inject({
        method: "POST",
        url: "/policies/safe-bash/check",
        headers: auth(),
        payload: { tool: "bash", args: { command: "ls -la" } },
      });
      expect(check.statusCode).toBe(200);
      const checkBody = check.json() as {
        decision: { block: boolean; reason?: string };
      };
      expect(checkBody.decision.block).toBe(true);
      expect(checkBody.decision.reason).toMatch(/denied/i);

      // 7. Apply generates extension file
      const apply = await handle.app.inject({
        method: "POST",
        url: "/policies/safe-bash/apply",
        headers: auth(),
      });
      expect(apply.statusCode).toBe(200);
      const applyBody = apply.json() as { path: string };
      expect(applyBody.path).toMatch(/pilot-policy-safe-bash\.ts$/);
      const { existsSync } = await import("node:fs");
      expect(existsSync(applyBody.path)).toBe(true);

      // 8. Unapply removes extension
      const unapply = await handle.app.inject({
        method: "POST",
        url: "/policies/safe-bash/unapply",
        headers: auth(),
      });
      expect(unapply.statusCode).toBe(200);
      expect((unapply.json() as { removed: boolean }).removed).toBe(true);
      expect(existsSync(applyBody.path)).toBe(false);

      // 9. Delete policy
      const del = await handle.app.inject({
        method: "DELETE",
        url: "/policies/safe-bash",
        headers: auth(),
      });
      expect(del.statusCode).toBe(200);
      expect((del.json() as { removed: boolean }).removed).toBe(true);

      // 10. List empty again
      const after = await handle.app.inject({
        method: "GET",
        url: "/policies",
        headers: auth(),
      });
      expect(after.json()).toEqual([]);
    });
  });
});

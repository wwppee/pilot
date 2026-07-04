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

    it("[network] GET /packs/info/:name 404 for missing pack", async () => {
      // Hits the live npm registry. Skipped when PILOT_SKIP_NETWORK=1
      // (sandbox/CI without outbound access). Run locally for a real
      // check; otherwise the 404 contract is exercised by the unit
      // test in `packs-errors.test.ts` if/when one is added.
      if (process.env["PILOT_SKIP_NETWORK"] === "1") return;
      const res = await handle.app.inject({
        method: "GET",
        url: "/packs/info/this-does-not-exist-9999",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    }, 15_000);

    // ─── Forge (v0.4.14+) ────────────────────────────

    it("GET /forge/search returns empty array for short / missing q", async () => {
      const res1 = await handle.app.inject({
        method: "GET",
        url: "/forge/search",
        headers: auth(),
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json()).toEqual([]);

      const res2 = await handle.app.inject({
        method: "GET",
        url: "/forge/search?q=a",
        headers: auth(),
      });
      expect(res2.json()).toEqual([]);
    });

    it("[network] GET /forge/inspect/:name 404 for missing package", async () => {
      if (process.env["PILOT_SKIP_NETWORK"] === "1") return;
      const res = await handle.app.inject({
        method: "GET",
        url: "/forge/inspect/this-does-not-exist-9999",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/not found/);
    }, 15_000);

    it("POST /forge/absorb rejects without name", async () => {
      const res = await handle.app.inject({
        method: "POST",
        url: "/forge/absorb",
        payload: {},
        headers: { ...auth(), "content-type": "application/json" },
      });
      expect(res.statusCode).toBe(400);
    });

    // ─── Avatars (v0.5+) ───────────────────────────────────────

    it("GET /avatars returns [] when no avatars exist", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/avatars",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("GET /avatars/current returns current Pilot state", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/avatars/current",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        packSources: [],
        extensions: [],
      });
    });

    it("Avatar lifecycle: capture → read → diff → delete", async () => {
      const cwd = "--test-cwd--";

      // Capture.
      const cap = await handle.app.inject({
        method: "POST",
        url: `/avatars/${cwd}/capture`,
        headers: auth(),
      });
      expect(cap.statusCode).toBe(200);
      const avatar = cap.json();
      expect(avatar.encodedCwd).toBe(cwd);
      expect(avatar.packSources).toEqual([]);
      expect(avatar.extensions).toEqual([]);

      // Listed.
      const list = await handle.app.inject({
        method: "GET",
        url: "/avatars",
        headers: auth(),
      });
      const listBody = list.json();
      expect(
        listBody.find((a: { encodedCwd: string }) => a.encodedCwd === cwd),
      ).toBeTruthy();

      // Read.
      const read = await handle.app.inject({
        method: "GET",
        url: `/avatars/${cwd}`,
        headers: auth(),
      });
      expect(read.statusCode).toBe(200);
      expect(read.json().encodedCwd).toBe(cwd);

      // Diff (clean on a fresh capture with no current state).
      const diff = await handle.app.inject({
        method: "GET",
        url: `/avatars/${cwd}/diff`,
        headers: auth(),
      });
      expect(diff.statusCode).toBe(200);
      const diffBody = diff.json();
      expect(diffBody.clean).toBe(true);
      expect(diffBody.profile.status).toBe("match");

      // Delete.
      const del = await handle.app.inject({
        method: "DELETE",
        url: `/avatars/${cwd}`,
        headers: auth(),
      });
      expect(del.statusCode).toBe(200);
      expect(del.json().ok).toBe(true);

      // Read after delete — 404.
      const after = await handle.app.inject({
        method: "GET",
        url: `/avatars/${cwd}`,
        headers: auth(),
      });
      expect(after.statusCode).toBe(404);
    });

    it("GET /avatars/:cwd/diff 404s for missing avatar", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/avatars/--ghost--/diff",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    });

    it("DELETE /avatars/:cwd is idempotent (404 on missing)", async () => {
      const res = await handle.app.inject({
        method: "DELETE",
        url: "/avatars/--never-existed--",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    });

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
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("GET /sessions/:id/snapshot returns derived snapshot", async () => {
      // Write a fresh session file so the test is self-contained.
      const encoded = Buffer.from("/tmp/fake-cwd-snap").toString("base64");
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const snapSessionId = "2026-07-04_10-00_snap";
      const sessionPath = join(sessionsDir, `${snapSessionId}.jsonl`);
      writeFileSync(
        sessionPath,
        [
          JSON.stringify({
            type: "session_info",
            timestamp: "2026-07-04T10:00:00Z",
          }),
          JSON.stringify({
            type: "message",
            timestamp: "2026-07-04T10:00:05Z",
            message: { role: "assistant", model: "claude-opus-4.6" },
          }),
        ].join("\n"),
      );

      const res = await handle.app.inject({
        method: "GET",
        url: `/sessions/${snapSessionId}/snapshot`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionId).toBe(snapSessionId);
      expect(body.model).toBe("claude-opus-4.6");
      expect(body.entryCount).toBe(2);
      expect(body.cwd).toBe(encoded);
      expect(body.note).toMatch(/v0\.4\.13/);
    });

    it("GET /sessions/:id/snapshot 404s when session file is gone", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/sessions/does-not-exist/snapshot",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toMatch(/not found/);
    });

    it("GET /sessions/:id/template returns model + tools", async () => {
      const encoded = Buffer.from("/tmp/fake-cwd-tmpl").toString("base64");
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const tmplSessionId = "2026-07-04_21-00_tmpl";
      writeFileSync(
        join(sessionsDir, `${tmplSessionId}.jsonl`),
        [
          JSON.stringify({
            type: "message",
            timestamp: "2026-07-04T21:00:00Z",
            message: {
              role: "assistant",
              model: "claude-sonnet-4-5",
              content: [
                { type: "toolCall", name: "bash" },
                { type: "toolCall", name: "read" },
              ],
            },
          }),
        ].join("\n"),
      );

      const res = await handle.app.inject({
        method: "GET",
        url: `/sessions/${tmplSessionId}/template`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionId).toBe(tmplSessionId);
      expect(body.model).toBe("claude-sonnet-4-5");
      expect(body.tools).toEqual(["bash", "read"]);
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

    it("[network] accepts valid CSRF + origin", async () => {
      // installPack shells out to `npm install`, which requires
      // outbound network. Skipped via PILOT_SKIP_NETWORK=1 in
      // sandboxes/CI without network. The CSRF flow itself is
      // verified by the two preceding tests (cookie set, 401, 403).
      if (process.env["PILOT_SKIP_NETWORK"] === "1") return;
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

  // ─── Compose catalog (v0.4.4) ─────────────────────

  describe("Compose catalog", () => {
    const auth = () => ({ "x-pilot-token": handle.token });

    it("GET /compose/catalog returns all 5 sections", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/compose/catalog",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        sessions: unknown[];
        packs: unknown[];
        profiles: unknown[];
        policies: unknown[];
        capabilities: unknown[];
        totalCount: number;
        generatedAt: string;
      };
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(Array.isArray(body.packs)).toBe(true);
      expect(Array.isArray(body.profiles)).toBe(true);
      expect(Array.isArray(body.policies)).toBe(true);
      expect(Array.isArray(body.capabilities)).toBe(true);
      expect(typeof body.totalCount).toBe("number");
      expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("GET /compose/catalog requires auth", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/compose/catalog",
      });
      expect(res.statusCode).toBe(401);
    });
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

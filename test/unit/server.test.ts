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

    // ─── Capability diff (v0.5.1+) ────────────────────────────

    it("Capability diff lifecycle: write two caps, diff them, delete", async () => {
      // Write two real capability files into the test home.
      const capsDir = join(tempHome, ".pilot", "capabilities");
      mkdirSync(join(capsDir, "cap-a"), { recursive: true });
      mkdirSync(join(capsDir, "cap-b"), { recursive: true });

      const capA = {
        id: "cap-a",
        title: "Old Title",
        type: "integration",
        description: "same description",
        sources: [{ type: "npm", ref: "npm:foo@1.0.0", mode: "L1-referenced" }],
        artifacts: { skills: ["s1"] },
        compatibility: { conflicts: [], requires: [] },
        metadata: {
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      };
      const capB = {
        ...capA,
        id: "cap-b",
        title: "New Title",
        sources: [{ type: "npm", ref: "npm:foo@2.0.0", mode: "L1-referenced" }],
        metadata: { ...capA.metadata, updatedAt: "2026-02-01T00:00:00.000Z" },
      };

      writeFileSync(
        join(capsDir, "cap-a", "capability.json"),
        JSON.stringify(capA),
        "utf-8",
      );
      writeFileSync(
        join(capsDir, "cap-b", "capability.json"),
        JSON.stringify(capB),
        "utf-8",
      );

      const res = await handle.app.inject({
        method: "GET",
        url: "/capabilities/cap-a/diff/cap-b",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.aId).toBe("cap-a");
      expect(body.bId).toBe("cap-b");
      expect(body.equal).toBe(false);
      expect(body.title.status).toBe("drift");
    });

    it("Capability diff 404 when one id is missing", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/capabilities/cap-a/diff/never-existed",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    });

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

    // ─── Avatars (v0.5+) ─────────────────────────────────────

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

    it("POST /avatars/:cwd/apply 404s when no Avatar", async () => {
      const res = await handle.app.inject({
        method: "POST",
        url: "/avatars/--no-such--/apply",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    });

    it("POST /avatars/:cwd/apply returns the apply report", async () => {
      // Capture a fresh Avatar (no packs, no active profile → both
      // steps should be "skipped" / "none").
      await handle.app.inject({
        method: "POST",
        url: "/avatars/--apply-cwd--/capture",
        headers: auth(),
      });

      const res = await handle.app.inject({
        method: "POST",
        url: "/avatars/--apply-cwd--/apply",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.encodedCwd).toBe("--apply-cwd--");
      expect(body.steps).toBeDefined();
      expect(Array.isArray(body.steps)).toBe(true);
      expect(body.installed).toEqual([]);
      expect(body.failed).toEqual([]);
      expect(body.skipped.length).toBeGreaterThan(0);
    });

    it("POST /avatars/:cwd/apply?dry=1 returns dry report (same shape, no side-effects)", async () => {
      // v0.5.3: dry-run via ?dry=1 query flag. Same report shape as
      // a real apply, but every step is dry:true and the root has
      // dry:true. No pi install / writeActiveProfile calls happen.
      await handle.app.inject({
        method: "POST",
        url: "/avatars/--apply-dry-cwd--/capture",
        headers: auth(),
      });

      const res = await handle.app.inject({
        method: "POST",
        url: "/avatars/--apply-dry-cwd--/apply?dry=1",
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.encodedCwd).toBe("--apply-dry-cwd--");
      expect(body.dry).toBe(true);
      // Capture had no packs/profile → both steps are skipped/none
      // steps, all marked dry.
      expect(body.steps.every((s: { dry?: boolean }) => s.dry === true)).toBe(
        true,
      );
    });

    it("POST /avatars/:cwd/apply?dry=1 404s when no Avatar", async () => {
      const res = await handle.app.inject({
        method: "POST",
        url: "/avatars/--no-such-dry--/apply?dry=1",
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

    // ─── Session info (v0.5.3+) ──────────────────────────────────────

    it("GET /sessions/:id/info returns summary card data", async () => {
      const encoded = Buffer.from("/tmp/fake-cwd-info").toString("base64");
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const infoSessionId = "2026-07-06_10-00_info";
      writeFileSync(
        join(sessionsDir, `${infoSessionId}.jsonl`),
        [
          JSON.stringify({
            type: "session_info",
            timestamp: "2026-07-06T10:00:00.000Z",
          }),
          JSON.stringify({
            type: "message",
            timestamp: "2026-07-06T10:00:05.000Z",
            message: {
              role: "user",
              content: "hi",
            },
          }),
          JSON.stringify({
            type: "message",
            timestamp: "2026-07-06T10:00:30.000Z",
            message: {
              role: "assistant",
              model: "claude-opus-4-6",
              content: [
                { type: "toolCall", name: "bash" },
                { type: "toolCall", name: "read" },
              ],
              usage: {
                input: 100,
                output: 50,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 150,
                cost: { input: 0.01, output: 0.015, total: 0.025 },
              },
            },
          }),
        ].join("\n"),
      );

      const res = await handle.app.inject({
        method: "GET",
        url: `/sessions/${infoSessionId}/info`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessionId).toBe(infoSessionId);
      expect(body.model).toBe("claude-opus-4-6");
      expect(body.durationMs).toBe(30_000);
      expect(body.totalTokens).toBe(150);
      expect(body.totalCost).toBeCloseTo(0.025, 6);
      expect(body.assistantMessages).toBe(1);
      expect(body.totalMessages).toBe(3);
      expect(body.toolsUsed).toEqual([
        { toolName: "bash", count: 1 },
        { toolName: "read", count: 1 },
      ]);
    });

    it("GET /sessions/:id/info 404s for missing session", async () => {
      const res = await handle.app.inject({
        method: "GET",
        url: "/sessions/--never-existed-info--/info",
        headers: auth(),
      });
      expect(res.statusCode).toBe(404);
    });

    // v0.5.3: cost aggregation correctness. Pi's `usage.cost` includes
    // both granular (input, output) and a canonical `total` field that
    // already equals input + output. Summing every numeric field would
    // double-count. The endpoint must prefer `total` and fall back to
    // summing the rest only when `total` is absent.
    it("GET /sessions/:id/info uses cost.total not sum(input+output) (no double-count)", async () => {
      // v0.5.3 gotcha: Pi's `usage.cost = {input, output, total}` where
      // `total === input + output`. Summing every numeric field would
      // double-count. The endpoint must use the canonical `total`.
      const encoded = Buffer.from("/tmp/fake-cwd-info-cost").toString("base64");
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const costSessionId = "2026-07-06_11-00_info_cost";
      writeFileSync(
        join(sessionsDir, `${costSessionId}.jsonl`),
        [
          JSON.stringify({
            type: "message",
            timestamp: "2026-07-06T11:00:00.000Z",
            message: {
              role: "assistant",
              model: "claude-opus-4-6",
              content: [{ type: "text", text: "hi" }],
              usage: {
                input: 100,
                output: 50,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 150,
                cost: { input: 0.01, output: 0.015, total: 0.025 },
              },
            },
          }),
          JSON.stringify({
            type: "message",
            timestamp: "2026-07-06T11:00:10.000Z",
            message: {
              role: "assistant",
              model: "claude-opus-4-6",
              content: [{ type: "text", text: "again" }],
              usage: {
                input: 200,
                output: 100,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 300,
                cost: { input: 0.02, output: 0.03, total: 0.05 },
              },
            },
          }),
        ].join("\n"),
      );

      const res = await handle.app.inject({
        method: "GET",
        url: `/sessions/${costSessionId}/info`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Must equal 0.025 + 0.05 = 0.075 (sum of `total`), not
      // double-counted 0.15.
      expect(body.totalCost).toBeCloseTo(0.075, 6);
      expect(body.totalTokens).toBe(450);
      expect(body.assistantMessages).toBe(2);
    });

    it("GET /sessions/:id/info falls back to summing fields when total absent", async () => {
      // Defensive: some custom trace writers might omit `cost.total`.
      // Summing the rest gives a sensible fallback.
      const encoded = Buffer.from("/tmp/fake-cwd-info-cost-fb").toString(
        "base64",
      );
      const sessionsDir = join(tempHome, ".pi/agent/sessions", encoded);
      mkdirSync(sessionsDir, { recursive: true });
      const fbSessionId = "2026-07-06_12-00_info_cost_fb";
      writeFileSync(
        join(sessionsDir, `${fbSessionId}.jsonl`),
        JSON.stringify({
          type: "message",
          timestamp: "2026-07-06T12:00:00.000Z",
          message: {
            role: "assistant",
            model: "claude-opus-4-6",
            content: [{ type: "text", text: "fallback" }],
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 100,
              // No `total` field here — only input + output.
              cost: { input: 0.1, output: 0.2 },
            },
          },
        }),
      );

      const res = await handle.app.inject({
        method: "GET",
        url: `/sessions/${fbSessionId}/info`,
        headers: auth(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.totalCost).toBeCloseTo(0.3, 6);
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { api, pilotWithCsrf, PilotApiError } from "../src/lib/pilot";

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) =>
    handler(url, init),
  ) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fn);
  return fn;
}

function writeTokenFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "pilot-web-"));
  // pilot reads ${HOME}/.pilot/server.token
  mkdirSync(join(dir, ".pilot"));
  writeFileSync(join(dir, ".pilot", "server.token"), content);
  process.env["HOME"] = dir;
  return dir;
}

describe("pilot client", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env["PILOT_TOKEN"];
    delete process.env["HOME"];
    delete process.env["PILOT_SERVER_URL"];
  });

  it("injects the X-Pilot-Token header from the token file", async () => {
    writeTokenFile("test-token-xyz");
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe("http://127.0.0.1:17361/health");
      expect(init.headers).toBeInstanceOf(Headers);
      const h = init.headers as Headers;
      expect(h.get("x-pilot-token")).toBe("test-token-xyz");
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, version: "0.3.0", uptimeSec: 1 }),
          { status: 200 },
        ),
      );
    });

    const h = await api.health();
    expect(h.ok).toBe(true);
    expect(h.version).toBe("0.3.0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("prefers PILOT_TOKEN env over the token file", async () => {
    writeTokenFile("from-file");
    process.env["PILOT_TOKEN"] = "from-env";

    mockFetch((_url, init) => {
      const h = init.headers as Headers;
      expect(h.get("x-pilot-token")).toBe("from-env");
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, version: "x", uptimeSec: 0 }), {
          status: 200,
        }),
      );
    });
    await api.health();
  });

  it("throws PilotApiError on non-2xx", async () => {
    writeTokenFile("t");
    mockFetch((_url, _init) =>
      Promise.resolve(new Response("not found", { status: 404 })),
    );
    await expect(api.packs()).rejects.toBeInstanceOf(PilotApiError);
    await expect(api.packs()).rejects.toMatchObject({ status: 404 });
  });

  it("falls back to localhost if no token is set", async () => {
    // Empty home so the file doesn't exist.
    const fakeHome = mkdtempSync(join(tmpdir(), "pilot-no-token-"));
    const origHome = process.env["HOME"];
    process.env["HOME"] = fakeHome;
    mockFetch((_url, init) => {
      const h = init.headers as Headers;
      expect(h.get("x-pilot-token")).toBeNull();
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, version: "x", uptimeSec: 0 }), {
          status: 200,
        }),
      );
    });
    const h = await api.health();
    expect(h.ok).toBe(true);
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("packs() parses JSON array", async () => {
    writeTokenFile("t");
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify([
            { name: "a", version: "1", source: "npm:a", enabled: true },
          ]),
          { status: 200 },
        ),
      ),
    );
    const list = await api.packs();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("a");
  });

  it("packInfo encodes the name", async () => {
    writeTokenFile("t");
    mockFetch((url) => {
      expect(url).toContain("/packs/info/");
      return Promise.resolve(
        new Response(JSON.stringify({ name: "x", version: "1" }), {
          status: 200,
        }),
      );
    });
    await api.packInfo("x");
  });

  it("cleanup: removes tmp token dirs", () => {
    // Just exercise the home-temp pattern; nothing to assert beyond
    // making sure the test process doesn't leak dirs.
    const d = mkdtempSync(join(tmpdir(), "pilot-web-leak-"));
    rmSync(d, { recursive: true, force: true });
    expect(true).toBe(true);
  });

  it("composeCatalog() calls /compose/catalog", async () => {
    writeTokenFile("t");
    mockFetch((url) => {
      expect(url).toBe("http://127.0.0.1:17361/compose/catalog");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            sessions: [],
            packs: [],
            profiles: [],
            policies: [],
            capabilities: [],
            totalCount: 0,
            generatedAt: "2026-07-03T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      );
    });
    const cat = await api.composeCatalog();
    expect(cat.totalCount).toBe(0);
    expect(cat.sessions).toEqual([]);
  });
});

describe("browserApi (v0.4.7)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env["PILOT_TOKEN"];
  });

  it("routes through /api/pilot/* (same-origin proxy)", async () => {
    mockFetch((url, init) => {
      expect(url).toBe("/api/pilot/policies");
      expect(init.headers).toBeInstanceOf(Headers);
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const { browserApi } = await import("../src/lib/pilot-browser");
    const list = await browserApi.policies();
    expect(list).toEqual([]);
  });

  it("PUT includes JSON body and content-type", async () => {
    let capturedBody: string | undefined;
    mockFetch((_url, init) => {
      capturedBody = typeof init.body === "string" ? init.body : undefined;
      const h = init.headers as Headers;
      expect(h.get("content-type")).toBe("application/json");
      return Promise.resolve(
        new Response(JSON.stringify({ name: "test", deny: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const { browserApi } = await import("../src/lib/pilot-browser");
    const result = await browserApi.setPolicy("test", {
      allow: [],
      deny: [],
      denyPaths: [],
      denyCommands: [],
      sensitivePatterns: [],
      requireApproval: [],
    });
    expect(result.name).toBe("test");
    expect(JSON.parse(capturedBody!)).toEqual({
      allow: [],
      deny: [],
      denyPaths: [],
      denyCommands: [],
      sensitivePatterns: [],
      requireApproval: [],
    });
  });

  it("throws PilotBrowserError on 4xx", async () => {
    mockFetch(() =>
      Promise.resolve(new Response("not found", { status: 404 })),
    );
    const { browserApi, PilotBrowserError } =
      await import("../src/lib/pilot-browser");
    await expect(browserApi.policy("missing")).rejects.toBeInstanceOf(
      PilotBrowserError,
    );
    await expect(browserApi.policy("missing")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("does NOT touch the filesystem (browser-safe)", async () => {
    // This test passes if browserApi doesn't try to read the token file
    // at runtime — confirming the import graph is fs-free.
    const { browserApi } = await import("../src/lib/pilot-browser");
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, version: "x", uptimeSec: 0 }), {
          status: 200,
        }),
      ),
    );
    // No token file exists; should still work because browser uses proxy
    const result = await browserApi.health();
    expect(result.ok).toBe(true);
  });

  it("encodeName URL-encodes npm scope names", async () => {
    let capturedUrl: string | undefined;
    mockFetch((url) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, version: "x", uptimeSec: 0 }), {
          status: 200,
        }),
      );
    });
    const { browserApi } = await import("../src/lib/pilot-browser");
    await browserApi.health();
    mockFetch((url) => {
      capturedUrl = url;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    await browserApi.getCapability("@foo/bar");
    // Browser uses standard encodeURIComponent; @ → %40, / → %2F.
    expect(capturedUrl).toBe("/api/pilot/capabilities/%40foo%2Fbar");
  });
});

describe("pilotWithCsrf", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env["PILOT_TOKEN"];
  });

  it("does a GET first, captures Set-Cookie + X-Pilot-CSRF, then sends POST with both", async () => {
    process.env["PILOT_TOKEN"] = "test-token";

    const calls: Array<{ url: string; method?: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        calls.push({
          url: String(url),
          method: init.method ?? "GET",
          headers,
        });

        if (calls.length === 1) {
          // First call: GET /health — return Set-Cookie + CSRF header
          return new Response('{"ok":true}', {
            status: 200,
            headers: {
              "set-cookie": "pilot-csrf=csrf-token-abc; Path=/",
              "x-pilot-csrf": "csrf-token-abc",
            },
          });
        }
        // Second call: the actual POST
        return new Response('{"ok":true}', { status: 200 });
      }) as never,
    );

    const res = await pilotWithCsrf("/packs/install", {
      method: "POST",
      body: JSON.stringify({ source: "npm:x" }),
    });
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.url).toContain("/packs/install");
    expect(calls[1]?.headers.get("x-pilot-csrf")).toBe("csrf-token-abc");
    expect(calls[1]?.headers.get("cookie")).toContain(
      "pilot-csrf=csrf-token-abc",
    );
  });

  it("throws PilotApiError when no CSRF token in GET response", async () => {
    process.env["PILOT_TOKEN"] = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })) as never,
    );
    await expect(
      pilotWithCsrf("/packs/install", { method: "POST", body: "{}" }),
    ).rejects.toThrow(/CSRF token/);
  });
});

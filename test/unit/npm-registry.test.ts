import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPacks, getPack } from "../../src/core/npm-registry.js";

const mockSearch = {
  total: 2,
  objects: [
    {
      package: {
        name: "pi-subagents",
        version: "0.31.0",
        description: "Subagent delegation for pi",
        keywords: ["pi", "subagent"],
        date: "2026-06-30T10:00:00Z",
        links: { npm: "https://www.npmjs.com/package/pi-subagents" },
        publisher: { username: "nicopreme" },
      },
    },
    {
      package: {
        name: "@tintinweb/pi-subagents",
        version: "0.12.0",
        description: "Claude Code-style sub-agents",
        keywords: ["pi", "subagent"],
        date: "2026-06-25T10:00:00Z",
      },
    },
  ],
};

const mockPackage = {
  name: "pi-subagents",
  "dist-tags": { latest: "0.31.0" },
  description: "Subagent delegation for pi",
  keywords: ["pi", "subagent"],
  time: {
    "0.31.0": "2026-06-30T10:00:00Z",
    created: "2026-01-01T00:00:00Z",
  },
  maintainers: [{ name: "nicopreme" }],
  repository: { url: "git+https://github.com/nicobailon/pi-subagents.git" },
};

describe("npm-registry", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/-/v1/search")) {
          return {
            ok: true,
            status: 200,
            json: async () => mockSearch,
          } as Response;
        }
        if (url.includes("/pi-subagents")) {
          return {
            ok: true,
            status: 200,
            json: async () => mockPackage,
          } as Response;
        }
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          json: async () => ({}),
        } as Response;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searchPacks maps response to Pack[]", async () => {
    const results = await searchPacks({ query: "subagent" });
    expect(results).toHaveLength(2);
    expect(results[0]?.name).toBe("pi-subagents");
    expect(results[0]?.author).toBe("nicopreme");
    expect(results[0]?.description).toContain("Subagent");
  });

  it("searchPacks accepts size and from options", async () => {
    const fetchMock = vi.mocked(fetch);
    await searchPacks({ query: "foo", size: 5, from: 10 });
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("size=5");
    expect(calledUrl).toContain("from=10");
    expect(calledUrl).toContain("text=foo");
  });

  it("getPack returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 404,
            statusText: "Not Found",
            json: async () => ({}),
          }) as Response,
      ),
    );
    expect(await getPack("does-not-exist")).toBe(null);
  });

  it("getPack maps full metadata", async () => {
    const pack = await getPack("pi-subagents");
    expect(pack).not.toBeNull();
    expect(pack?.version).toBe("0.31.0");
    expect(pack?.author).toBe("nicopreme");
    expect(pack?.keywords).toEqual(["pi", "subagent"]);
    expect(pack?.repository).toContain("github.com");
  });
});

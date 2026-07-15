/**
 * forge.test.ts — coverage for core/forge.ts helpers.
 *
 * Two layers:
 *   - Pure helpers (buildCapability / mapKindToType /
 *     deriveCapabilityId / isValidCapabilityId) — no mocking needed.
 *   - forgeAbsorb / forgeInspect — needs a stubbed `fetch` to avoid
 *     hitting the real npm registry. Uses vi.stubGlobal("fetch").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ForgeAbsorbError,
  buildCapability,
  deriveCapabilityId,
  forgeAbsorb,
  forgeInspect,
  isValidCapabilityId,
  mapKindToType,
} from "../../src/core/forge.js";
import type { PackManifest } from "../../src/core/pack-manifest.js";

// v0.6.15: provide a hook so the EPERM test can force
// `ensurePilotCapabilitiesDir` to fail. The real helper
// delegates to `node:fs/promises.mkdir` (read-only ESM module —
// vi.spyOn doesn't work on it), so we expose a mutable reference
// on `globalThis` for tests to swap. In production nothing
// touches this — it's a no-op shape.
type EnsureOverride = (home?: string) => Promise<void>;
const ENSURE_OVERRIDE_KEY = Symbol.for("pilot.test.ensureCapabilities");
type WithOverride = typeof globalThis & {
  [ENSURE_OVERRIDE_KEY]?: EnsureOverride;
};
function setEnsureOverride(fn: EnsureOverride | undefined): void {
  (globalThis as WithOverride)[ENSURE_OVERRIDE_KEY] = fn;
}

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "pilot-forge-"));
}

const fakeManifest: PackManifest = {
  name: "pi-x",
  version: "1.2.3",
  description: "A pi extension",
  pi: { kind: "extension", extension: "dist/index.js" },
};

function stubRegistry(manifest: PackManifest | null = fakeManifest): void {
  const fetchMock = vi.fn(async () => {
    if (manifest === null) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({}),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        name: manifest.name,
        description: manifest.description,
        "dist-tags": { latest: manifest.version },
        versions: {
          [manifest.version]: {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            pi: manifest.pi,
          },
        },
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
}

describe("buildCapability", () => {
  it("builds an L2-wrapped capability when extension is set", () => {
    const cap = buildCapability("pi-x", fakeManifest);
    expect(cap.id).toBe("pi-x");
    expect(cap.title).toBe("pi-x");
    expect(cap.type).toBe("integration");
    expect(cap.sources[0]?.mode).toBe("L2-wrapped");
    expect(cap.sources[0]?.ref).toBe("npm:pi-x@1.2.3");
  });

  it("builds an L1-referenced capability when no extension", () => {
    const noExt: PackManifest = {
      ...fakeManifest,
      pi: { kind: "skill", skills: ["foo"] },
    };
    const cap = buildCapability("pi-x", noExt);
    expect(cap.sources[0]?.mode).toBe("L1-referenced");
    expect(cap.type).toBe("tool"); // skill → tool
  });

  it("falls back to 'integration' when kind is unset", () => {
    const noKind: PackManifest = {
      ...fakeManifest,
      pi: {},
    };
    const cap = buildCapability("pi-x", noKind);
    expect(cap.type).toBe("integration");
  });
});

describe("mapKindToType", () => {
  it.each([
    ["skill", "tool"],
    ["prompt", "workflow"],
    ["theme", "integration"],
    ["extension", "integration"],
    [undefined, "integration"],
    ["weird-kind", "integration"],
  ])("kind=%s → type=%s", (kind, expected) => {
    expect(mapKindToType(kind)).toBe(expected);
  });
});

describe("deriveCapabilityId", () => {
  it("strips npm scope and lowercases", () => {
    expect(deriveCapabilityId({ name: "@wwppee/foo", version: "1.0.0" })).toBe(
      "foo",
    );
    expect(deriveCapabilityId({ name: "Bar", version: "1.0.0" })).toBe("bar");
  });
});

describe("isValidCapabilityId", () => {
  it.each([
    ["foo", true],
    ["foo-bar", true],
    ["foo-bar-baz", true],
    ["FooBar", false],
    ["foo--bar", false],
    ["foo_bar", false],
    ["", false],
  ])("id=%s → valid=%s", (id, expected) => {
    expect(isValidCapabilityId(id)).toBe(expected);
  });
});

describe("forgeInspect", () => {
  beforeEach(() => stubRegistry(fakeManifest));
  afterEach(() => vi.unstubAllGlobals());

  it("returns pack + manifest on success", async () => {
    const result = await forgeInspect("pi-x");
    expect(result).not.toBeNull();
    expect(result!.pack.name).toBe("pi-x");
    expect(result!.manifest.name).toBe("pi-x");
    expect(result!.manifest.pi?.kind).toBe("extension");
  });

  it("returns null when package not on registry", async () => {
    vi.unstubAllGlobals();
    stubRegistry(null);
    const result = await forgeInspect("nope");
    expect(result).toBeNull();
  });
});

describe("forgeAbsorb", () => {
  beforeEach(() => stubRegistry(fakeManifest));
  afterEach(() => vi.unstubAllGlobals());

  it("writes capability.json to ~/.pilot/capabilities/<id>/", async () => {
    const home = freshHome();
    const result = await forgeAbsorb("pi-x", undefined, home);
    expect(result.id).toBe("pi-x");
    expect(result.path).toBe(
      join(home, ".pilot/capabilities", "pi-x", "capability.json"),
    );
    expect(existsSync(result.path)).toBe(true);

    const written = JSON.parse(readFileSync(result.path, "utf-8"));
    expect(written.id).toBe("pi-x");
    expect(written.title).toBe("pi-x");
  });

  it("honors an explicit --as override for the capability id", async () => {
    const home = freshHome();
    const result = await forgeAbsorb("pi-x", "my-custom-id", home);
    expect(result.id).toBe("my-custom-id");
    expect(result.path).toBe(
      join(home, ".pilot", "capabilities", "my-custom-id", "capability.json"),
    );
  });

  it("throws ForgeAbsorbError(not-found) when registry returns 404", async () => {
    vi.unstubAllGlobals();
    stubRegistry(null);
    const home = freshHome();
    await expect(forgeAbsorb("nope", undefined, home)).rejects.toThrow(
      ForgeAbsorbError,
    );
    try {
      await forgeAbsorb("nope", undefined, home);
    } catch (e) {
      expect((e as ForgeAbsorbError).code).toBe("not-found");
    }
  });

  it("throws ForgeAbsorbError(invalid-id) when override is invalid", async () => {
    const home = freshHome();
    await expect(forgeAbsorb("pi-x", "Bad_ID", home)).rejects.toMatchObject({
      code: "invalid-id",
    });
  });

  // v0.6.15: regression — when the user (or a sandboxed shell)
  // can't write to ~/.pilot/, surface an actionable error that
  // tells them to run `pilot init` from a non-sandboxed terminal,
  // instead of the bare "Failed to write X: EPERM" the previous
  // version produced.
  it("surfaces an actionable EPERM hint when the capabilities dir is unwritable", async () => {
    const home = freshHome();
    setEnsureOverride(async () => {
      throw Object.assign(new Error("operation not permitted"), {
        code: "EPERM",
      }) as NodeJS.ErrnoException;
    });
    try {
      await expect(forgeAbsorb("pi-x", undefined, home)).rejects.toThrow(
        /pilot init/,
      );
      await expect(forgeAbsorb("pi-x", undefined, home)).rejects.toThrow(
        /EPERM/,
      );
    } finally {
      setEnsureOverride(undefined);
    }
  });

  // v0.6.15: regression — absorb now lazy-inits
  // ~/.pilot/capabilities/ via the helper, so users who never
  // ran `pilot init` can still absorb. (The existing tests above
  // already exercise this implicitly — freshHome() returns a
  // tmpdir with no subdirectories — but this test pins the
  // contract explicitly so a future refactor can't quietly
  // re-introduce the dependency.)
  it("absorbs successfully when ~/.pilot/capabilities/ does not yet exist", async () => {
    const home = freshHome();
    // Sanity: confirm the dir really doesn't exist yet.
    expect(existsSync(join(home, ".pilot", "capabilities"))).toBe(false);
    const result = await forgeAbsorb("pi-x", undefined, home);
    // After absorb, both the parent and the id subdir should
    // have been created.
    expect(existsSync(join(home, ".pilot", "capabilities"))).toBe(true);
    expect(existsSync(result.path)).toBe(true);
  });
});

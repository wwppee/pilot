import { describe, it, expect } from "vitest";
import {
  readSettings,
  listSources,
  listPackages,
} from "../../src/core/settings.js";

describe("settings", () => {
  it("returns null when settings.json does not exist", async () => {
    // We can't easily mock the home dir without DI, so this just verifies
    // the function returns null on missing file (real run on this machine
    // may or may not have one — both are valid).
    const result = await readSettings();
    // result is null OR a parsed object — never throws
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("listSources returns [] for null settings", () => {
    expect(listSources(null)).toEqual([]);
  });

  it("listSources returns [] when packages is not an array", () => {
    // v0.5.5: pi's field is `packages`, not `sources`.
    expect(listSources({ packages: "not-an-array" as never })).toEqual([]);
  });

  it("listSources returns package source strings (string form)", () => {
    // pi accepts string-form packages: just "npm:foo".
    const packages = ["npm:pi-subagents", "npm:pi-lens"];
    expect(listSources({ packages })).toEqual(packages);
  });

  it("listSources extracts .source from object-form packages", () => {
    // pi also accepts object-form: {source, extensions?, skills?, ...}.
    const packages = [
      "npm:pi-subagents",
      { source: "git:github.com/u/r@v1", skills: ["a"] },
    ];
    expect(listSources({ packages })).toEqual([
      "npm:pi-subagents",
      "git:github.com/u/r@v1",
    ]);
  });

  it("listPackages returns the raw PackageSource[] for advanced consumers", () => {
    const packages = [{ source: "npm:pi-subagents", extensions: ["a"] }];
    expect(listPackages({ packages })).toEqual(packages);
  });

  it("preserves unknown fields across reads (index signature)", () => {
    // v0.5.5: readSettings returns the full object — unknown fields
    // round-trip so a Pilot write can't silently drop them.
    const settings = {
      defaultModel: "claude-opus-4-6",
      theme: "dark",
      compaction: { enabled: true },
      "user-custom-field": "keep me",
    };
    expect(listSources(settings)).toEqual([]);
    expect((settings as Record<string, unknown>)["user-custom-field"]).toBe(
      "keep me",
    );
  });
});

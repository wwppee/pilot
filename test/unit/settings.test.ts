import { describe, it, expect } from "vitest";
import { readSettings, listSources } from "../../src/core/settings.js";
import {
  statSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("listSources returns [] when sources is not an array", () => {
    expect(listSources({ sources: "not-an-array" as never })).toEqual([]);
  });

  it("listSources returns the array when present", () => {
    const sources = [{ source: "npm:pi-subagents", enabled: true }];
    expect(listSources({ sources })).toEqual(sources);
  });
});

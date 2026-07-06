/**
 * Tests for `core/apply-profile-to-pi.ts` — the v0.5.5 bridge that
 * applies a Pilot profile to pi's real `settings.json`.
 *
 * Covers:
 *   1. Merges model + provider into defaultModel/defaultProvider
 *   2. Merges thinking into defaultThinkingLevel
 *   3. Merges packs (additive, dedup by source string)
 *   4. Is idempotent — re-applying same profile is a no-op message
 *   5. Preserves unknown fields in the existing settings.json
 *   6. Handles missing settings.json (creates one)
 *   7. Reports what changed in a human-readable summary
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyProfileToPi } from "../../src/core/apply-profile-to-pi.js";
import { piSettingsFile } from "../../src/core/types.js";

let fakeHome: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "pilot-apply-profile-"));
  originalEnv = { ...process.env };
  process.env.HOME = fakeHome;
});

afterEach(() => {
  process.env = originalEnv;
  if (existsSync(fakeHome)) {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

function writeExistingSettings(content: object): void {
  mkdirSync(join(fakeHome, ".pi/agent"), { recursive: true });
  writeFileSync(piSettingsFile(fakeHome), JSON.stringify(content, null, 2));
}

describe("applyProfileToPi", () => {
  it("writes defaultModel + defaultProvider to settings.json", async () => {
    const r = await applyProfileToPi(
      {
        name: "pi-architect",
        provider: "anthropic",
        model: "claude-opus-4-6",
      },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(r.changes.defaultModel?.after).toBe("claude-opus-4-6");
    expect(r.changes.defaultProvider?.after).toBe("anthropic");

    const written = JSON.parse(readFileSync(piSettingsFile(fakeHome), "utf-8"));
    expect(written.defaultModel).toBe("claude-opus-4-6");
    expect(written.defaultProvider).toBe("anthropic");
  });

  it("writes defaultThinkingLevel from profile.thinking", async () => {
    const r = await applyProfileToPi(
      { name: "deep-think", thinking: "high" },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(r.changes.defaultThinkingLevel?.after).toBe("high");

    const written = JSON.parse(readFileSync(piSettingsFile(fakeHome), "utf-8"));
    expect(written.defaultThinkingLevel).toBe("high");
  });

  it("merges packs additively (dedup by source string)", async () => {
    writeExistingSettings({ packages: ["npm:existing-pack"] });
    const r = await applyProfileToPi(
      {
        name: "with-pack",
        packs: ["npm:existing-pack", "npm:new-pack"],
      },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(r.changes.packagesAdded).toBe(1);

    const written = JSON.parse(readFileSync(piSettingsFile(fakeHome), "utf-8"));
    expect(written.packages).toEqual(["npm:existing-pack", "npm:new-pack"]);
  });

  it("supports object-form packages from the profile", async () => {
    // Pilot profiles can carry object-form packages with resource
    // filters. The merge should preserve the object shape.
    const r = await applyProfileToPi(
      {
        name: "skill-only",
        packs: [
          {
            source: "git:github.com/u/r@v1",
            skills: ["only-this-skill.md"],
          },
        ],
      },
      fakeHome,
    );
    expect(r.ok).toBe(true);

    const written = JSON.parse(readFileSync(piSettingsFile(fakeHome), "utf-8"));
    expect(written.packages).toEqual([
      {
        source: "git:github.com/u/r@v1",
        skills: ["only-this-skill.md"],
      },
    ]);
  });

  it("is idempotent — re-applying same profile reports 'already matches'", async () => {
    // First apply creates the settings file.
    await applyProfileToPi(
      { name: "pi-architect", model: "claude-opus-4-6" },
      fakeHome,
    );
    // Second apply with the same model: nothing should change.
    const r2 = await applyProfileToPi(
      { name: "pi-architect", model: "claude-opus-4-6" },
      fakeHome,
    );
    expect(r2.ok).toBe(true);
    expect(r2.message).toMatch(/already matches/i);
    // No packagesAdded either.
    expect(r2.changes.packagesAdded).toBe(0);
  });

  it("preserves unknown fields in the existing settings.json", async () => {
    // Pilot only writes its own fields. Anything else the user had
    // configured (theme, compaction, transport, telemetry opt-in,
    // etc.) must round-trip through a Pilot write.
    writeExistingSettings({
      theme: "dark",
      compaction: { enabled: true, reserveTokens: 5000 },
      transport: "websocket",
      "user-custom-field": "keep",
    });
    await applyProfileToPi({ name: "x", model: "claude-opus-4-6" }, fakeHome);

    const written = JSON.parse(readFileSync(piSettingsFile(fakeHome), "utf-8"));
    expect(written.theme).toBe("dark");
    expect(written.compaction.reserveTokens).toBe(5000);
    expect(written.transport).toBe("websocket");
    expect(written["user-custom-field"]).toBe("keep");
    expect(written.defaultModel).toBe("claude-opus-4-6");
  });

  it("creates settings.json if it doesn't exist", async () => {
    expect(existsSync(piSettingsFile(fakeHome))).toBe(false);
    const r = await applyProfileToPi(
      { name: "fresh", model: "claude-opus-4-6" },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(existsSync(piSettingsFile(fakeHome))).toBe(true);
  });

  it("returns a human-readable summary of what changed", async () => {
    const r = await applyProfileToPi(
      {
        name: "full",
        provider: "anthropic",
        model: "claude-opus-4-6",
        thinking: "medium",
        packs: ["npm:pi-lens"],
      },
      fakeHome,
    );
    expect(r.ok).toBe(true);
    expect(r.message).toContain('applied profile "full"');
    expect(r.message).toMatch(/defaultModel: \(unset\) → claude-opus-4-6/);
    expect(r.message).toMatch(/defaultProvider: \(unset\) → anthropic/);
    expect(r.message).toMatch(/defaultThinkingLevel: \(unset\) → medium/);
    expect(r.message).toMatch(/packages added: 1/);
  });

  it("leaves existing provider alone when only model is set", async () => {
    // Don't guess the provider — better to keep the user's existing
    // pairing than assume one.
    writeExistingSettings({
      defaultProvider: "openai",
      defaultModel: "gpt-4",
    });
    await applyProfileToPi(
      { name: "switch-model", model: "claude-opus-4-6" },
      fakeHome,
    );
    const written = JSON.parse(readFileSync(piSettingsFile(fakeHome), "utf-8"));
    expect(written.defaultModel).toBe("claude-opus-4-6");
    expect(written.defaultProvider).toBe("openai"); // unchanged
  });
});

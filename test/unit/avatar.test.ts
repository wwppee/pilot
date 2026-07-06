/**
 * avatar.test.ts — coverage for core/avatar.ts.
 *
 * Each test writes a fake Pilot state into a fresh tmpdir and
 * asserts captureAvatar / readAvatar / diffAvatar behave correctly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyAvatar,
  avatarPath,
  captureAvatar,
  deleteAvatar,
  diffAvatar,
  listAvatars,
  readAvatar,
  readCurrentState,
  writeAvatar,
  type Avatar,
} from "../../src/core/avatar.js";

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "pilot-avatar-"));
}

function writeProfile(
  home: string,
  name: string,
  fields: Record<string, unknown>,
): void {
  const profilesDir = join(home, ".pilot", "profiles");
  mkdirSync(profilesDir, { recursive: true });
  const now = new Date().toISOString();
  const toml = [
    `name = "${name}"`,
    ...Object.entries(fields).map(([k, v]) => {
      if (typeof v === "string") return `${k} = "${v}"`;
      return `${k} = ${JSON.stringify(v)}`;
    }),
    `createdAt = "${now}"`,
    `updatedAt = "${now}"`,
  ].join("\n");
  writeFileSync(join(profilesDir, `${name}.toml`), toml, "utf-8");
}

function writeActiveProfile(home: string, name: string): void {
  const dir = join(home, ".pilot");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "active.json"),
    JSON.stringify(
      { name, activatedAt: new Date().toISOString(), source: "cli" },
      null,
      2,
    ) + "\n",
  );
  // v0.5.6: stub a matching profile TOML so readActiveProfile's
  // ghost-profile guard doesn't clear the diary — but only if no
  // profile already exists for this name (otherwise we'd clobber a
  // richer fixture written by `writeProfile`).
  const profPath = join(dir, "profiles", `${name}.toml`);
  if (!existsSync(profPath)) {
    mkdirSync(join(dir, "profiles"), { recursive: true });
    writeFileSync(
      profPath,
      `name = "${name}"\ncreatedAt = "2026-07-06T00:00:00.000Z"\nupdatedAt = "2026-07-06T00:00:00.000Z"\ndescription = "stub for test"\n`,
      "utf-8",
    );
  }
}

function writePiSettings(home: string, packages: string[]): void {
  // v0.5.5: pi's field is `packages` (string-form, the common case).
  // No `enabled` flag — every package listed is implicitly enabled.
  const dir = join(home, ".pi", "agent");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({ packages }, null, 2) + "\n",
    "utf-8",
  );
}

function writeGeneratedPolicy(home: string, name: string): void {
  const dir = join(home, ".pilot", "extensions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.ts`), "export {};\n", "utf-8");
}

describe("avatarPath / readAvatar", () => {
  it("avatarPath resolves to ~/.pilot/avatars/<id>.json", () => {
    const home = freshHome();
    expect(avatarPath("--home-me-proj--", home)).toBe(
      join(home, ".pilot", "avatars", "--home-me-proj--.json"),
    );
  });

  it("readAvatar returns null when no Avatar exists", async () => {
    const home = freshHome();
    expect(await readAvatar("ghost", home)).toBeNull();
  });

  it("writeAvatar persists + readAvatar round-trips", async () => {
    const home = freshHome();
    const avatar: Avatar = {
      encodedCwd: "--home-me-proj--",
      capturedAt: "2026-07-05T00:00:00Z",
      profile: "pi-architect",
      model: "claude-opus-4-6",
      packSources: ["npm:foo", "npm:bar"],
      extensions: ["pilot-policy-safe-bash"],
    };
    await writeAvatar(avatar, home);
    expect(existsSync(avatarPath(avatar.encodedCwd, home))).toBe(true);
    const reloaded = await readAvatar(avatar.encodedCwd, home);
    expect(reloaded).toEqual(avatar);
  });

  it("readAvatar throws on malformed JSON", async () => {
    const home = freshHome();
    const dir = join(home, ".pilot", "avatars");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "broken.json"), "{not-json", "utf-8");
    await expect(readAvatar("broken", home)).rejects.toThrow(/malformed/);
  });

  it("deleteAvatar removes the file and is idempotent", async () => {
    const home = freshHome();
    await writeAvatar(
      {
        encodedCwd: "x",
        capturedAt: "2026-07-05T00:00:00Z",
        packSources: [],
        extensions: [],
      },
      home,
    );
    expect(await deleteAvatar("x", home)).toBe(true);
    expect(await deleteAvatar("x", home)).toBe(false);
    expect(existsSync(avatarPath("x", home))).toBe(false);
  });

  it("listAvatars returns [] when the dir doesn't exist", async () => {
    const home = freshHome();
    expect(await listAvatars(home)).toEqual([]);
  });

  it("listAvatars returns all valid Avatars sorted by encodedCwd", async () => {
    const home = freshHome();
    await writeAvatar(
      {
        encodedCwd: "--zzz--",
        capturedAt: "2026-07-05T00:00:00Z",
        packSources: [],
        extensions: [],
      },
      home,
    );
    await writeAvatar(
      {
        encodedCwd: "--aaa--",
        capturedAt: "2026-07-05T00:00:00Z",
        packSources: [],
        extensions: [],
      },
      home,
    );
    const list = await listAvatars(home);
    expect(list.map((a) => a.encodedCwd)).toEqual(["--aaa--", "--zzz--"]);
  });
});

describe("captureAvatar", () => {
  it("captures active profile + model + packSources + extensions", async () => {
    const home = freshHome();
    writeProfile(home, "pi-architect", { model: "claude-opus-4-6" });
    writeActiveProfile(home, "pi-architect");
    writePiSettings(home, ["npm:foo", "npm:bar"]);
    writeGeneratedPolicy(home, "pilot-policy-safe-bash");

    const avatar = await captureAvatar("--home-me-proj--", home);
    expect(avatar.profile).toBe("pi-architect");
    expect(avatar.model).toBe("claude-opus-4-6");
    expect(avatar.packSources).toEqual(["npm:foo", "npm:bar"]);
    expect(avatar.extensions).toEqual(["pilot-policy-safe-bash"]);
    expect(avatar.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Verify it was persisted too.
    const onDisk = JSON.parse(
      readFileSync(avatarPath(avatar.encodedCwd, home), "utf-8"),
    ) as Avatar;
    expect(onDisk.profile).toBe("pi-architect");
  });

  it("captures with no active profile (just current packSources + extensions)", async () => {
    const home = freshHome();
    writePiSettings(home, ["npm:foo"]);
    writeGeneratedPolicy(home, "pilot-policy-x");

    const avatar = await captureAvatar("--p--", home);
    expect(avatar.profile).toBeUndefined();
    expect(avatar.model).toBeUndefined();
    expect(avatar.packSources).toEqual(["npm:foo"]);
    expect(avatar.extensions).toEqual(["pilot-policy-x"]);
  });
});

describe("diffAvatar", () => {
  it("clean=true when every field matches or is extra", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      profile: "pi-architect",
      model: "claude-opus-4-6",
      packSources: ["npm:foo"],
      extensions: [],
    };
    const current = {
      activeProfile: "pi-architect",
      model: "claude-opus-4-6",
      packSources: ["npm:foo", "npm:extra"],
      extensions: [],
    };
    const diff = diffAvatar(avatar, current);
    expect(diff.clean).toBe(true);
    expect(diff.profile.status).toBe("match");
    expect(diff.model.status).toBe("match");
    // packSources has extra in current — that's informational.
    expect(diff.packSources.status).toBe("extra");
  });

  it("clean=false when profile drifts", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      profile: "pi-architect",
      packSources: [],
      extensions: [],
    };
    const diff = diffAvatar(avatar, {
      activeProfile: "pi-quick",
      packSources: [],
      extensions: [],
    });
    expect(diff.profile.status).toBe("drift");
    expect(diff.clean).toBe(false);
  });

  it("clean=false when avatar expects a profile but none is active", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      profile: "pi-architect",
      packSources: [],
      extensions: [],
    };
    const diff = diffAvatar(avatar, { packSources: [], extensions: [] });
    expect(diff.profile.status).toBe("missing");
    expect(diff.clean).toBe(false);
  });

  it("clean=true when avatar has no profile expectation AND none is active", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      packSources: [],
      extensions: [],
    };
    const diff = diffAvatar(avatar, { packSources: [], extensions: [] });
    expect(diff.profile.status).toBe("match");
    expect(diff.model.status).toBe("match");
    expect(diff.clean).toBe(true);
  });

  it("packSources drift when expected item is missing", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      packSources: ["npm:foo", "npm:bar"],
      extensions: [],
    };
    const diff = diffAvatar(avatar, {
      packSources: ["npm:foo"],
      extensions: [],
    });
    expect(diff.packSources.status).toBe("missing");
    expect(diff.clean).toBe(false);
  });

  it("packSources drift when current has extras AND expected has missing", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      packSources: ["npm:foo"],
      extensions: [],
    };
    const diff = diffAvatar(avatar, {
      packSources: ["npm:bar"],
      extensions: [],
    });
    expect(diff.packSources.status).toBe("drift");
    expect(diff.clean).toBe(false);
  });

  it("extensions match when both empty", () => {
    const avatar: Avatar = {
      encodedCwd: "--p--",
      capturedAt: "2026-07-05T00:00:00Z",
      packSources: [],
      extensions: [],
    };
    const diff = diffAvatar(avatar, { packSources: [], extensions: [] });
    expect(diff.extensions.status).toBe("match");
  });
});

describe("readCurrentState", () => {
  it("returns active profile + model + packSources + extensions", async () => {
    const home = freshHome();
    writeProfile(home, "pi-architect", { model: "claude-opus-4-6" });
    writeActiveProfile(home, "pi-architect");
    writePiSettings(home, ["npm:foo"]);
    writeGeneratedPolicy(home, "pilot-policy-safe-bash");

    const current = await readCurrentState(home);
    expect(current.activeProfile).toBe("pi-architect");
    expect(current.model).toBe("claude-opus-4-6");
    expect(current.packSources).toEqual(["npm:foo"]);
    expect(current.extensions).toEqual(["pilot-policy-safe-bash"]);
  });

  it("returns empty optionals when no state exists", async () => {
    const home = freshHome();
    const current = await readCurrentState(home);
    expect(current.activeProfile).toBeUndefined();
    expect(current.model).toBeUndefined();
    expect(current.packSources).toEqual([]);
    expect(current.extensions).toEqual([]);
  });
});

// ─── applyAvatar (v0.5.2+) ─────────────────────────────────

/**
 * applyAvatar shells out to `pi install` for missing packs and to
 * `writeActiveProfile` for the profile. We mock those two surfaces
 * so the tests stay offline + deterministic.
 *
 * `vi.mock` is hoisted, so the inline factory must not reference
 * outer-scope variables. We use vi.hoisted() for the mock fn ref.
 */
const mockRunPiStreaming = vi.hoisted(() => vi.fn(async () => undefined));
const mockWriteActiveProfile = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../../src/core/pi-cli.js", () => ({
  runPiStreaming: mockRunPiStreaming,
}));
vi.mock("../../src/core/profile-state.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/core/profile-state.js")
  >("../../src/core/profile-state.js");
  return {
    ...actual,
    writeActiveProfile: mockWriteActiveProfile,
  };
});

describe("applyAvatar", () => {
  beforeEach(() => {
    mockRunPiStreaming.mockReset();
    mockRunPiStreaming.mockResolvedValue(undefined);
    mockWriteActiveProfile.mockReset();
    mockWriteActiveProfile.mockResolvedValue(undefined);
  });

  it("returns null when no Avatar exists", async () => {
    const home = freshHome();
    expect(await applyAvatar("--ghost--", home)).toBeNull();
  });

  it("installs every missing pack and activates the profile", async () => {
    const home = freshHome();
    // No packs installed, no active profile.
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-05T00:00:00Z",
        profile: "pi-architect",
        model: "claude-opus-4-6",
        packSources: ["npm:foo", "npm:bar"],
        extensions: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home);
    expect(report).not.toBeNull();
    expect(report!.installed).toEqual(["npm:foo", "npm:bar"]);
    expect(report!.activated).toBe("pi-architect");
    expect(report!.failed).toEqual([]);
    // Both packs should have triggered pi install.
    expect(mockRunPiStreaming).toHaveBeenCalledTimes(2);
    expect(mockRunPiStreaming).toHaveBeenCalledWith(["install", "npm:foo"]);
    expect(mockRunPiStreaming).toHaveBeenCalledWith(["install", "npm:bar"]);
    expect(mockWriteActiveProfile).toHaveBeenCalledWith(
      "pi-architect",
      "cli",
      home,
    );
    // Step report records every action.
    const installSteps = report!.steps.filter(
      (s) => s.action === "install-pack",
    );
    expect(installSteps).toHaveLength(2);
    expect(installSteps.every((s) => s.status === "ok")).toBe(true);
  });

  it("skips packs that are already installed", async () => {
    const home = freshHome();
    writePiSettings(home, ["npm:foo"]); // npm:foo already installed
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-05T00:00:00Z",
        packSources: ["npm:foo"],
        extensions: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home);
    expect(report!.installed).toEqual([]);
    // Should NOT call pi install for an already-installed pack.
    expect(mockRunPiStreaming).not.toHaveBeenCalled();
    // Skipped step should mention "all packs already installed".
    const skipSteps = report!.steps.filter((s) => s.status === "skipped");
    expect(
      skipSteps.some((s) => s.message?.includes("already installed")),
    ).toBe(true);
  });

  it("skips profile activation when already active", async () => {
    const home = freshHome();
    writeProfile(home, "pi-architect", {});
    writeActiveProfile(home, "pi-architect");
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-05T00:00:00Z",
        profile: "pi-architect",
        packSources: [],
        extensions: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home);
    expect(report!.activated).toBeUndefined();
    expect(mockWriteActiveProfile).not.toHaveBeenCalled();
    expect(
      report!.skipped.some((s) => s.includes("profile already active")),
    ).toBe(true);
  });

  it("captures install failures per-pack (one fail doesn't block others)", async () => {
    const home = freshHome();
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-05T00:00:00Z",
        packSources: ["npm:good", "npm:bad"],
        extensions: [],
      },
      home,
    );

    mockRunPiStreaming.mockImplementation(async (args: string[]) => {
      if (args.includes("npm:bad")) {
        throw new Error("404 not found");
      }
    });

    const report = await applyAvatar("--proj--", home);
    expect(report!.installed).toEqual(["npm:good"]);
    expect(report!.failed).toEqual(["npm:bad"]);
    // Install npm:good still attempted.
    expect(mockRunPiStreaming).toHaveBeenCalledTimes(2);
    // Failed step carries the error message.
    const failStep = report!.steps.find(
      (s) => s.action === "install-pack" && s.target === "npm:bad",
    );
    expect(failStep?.status).toBe("failed");
    expect(failStep?.message).toMatch(/404/);
  });

  it("skips profile activation when Avatar has no profile", async () => {
    const home = freshHome();
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-05T00:00:00Z",
        packSources: [],
        extensions: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home);
    expect(report!.activated).toBeUndefined();
    expect(report!.skipped.some((s) => s.includes("no profile"))).toBe(true);
    expect(mockWriteActiveProfile).not.toHaveBeenCalled();
  });

  it("does NOT touch extensions (policy regen is explicit, not implicit)", async () => {
    // Documenting the deliberate non-action: extensions in the
    // Avatar are informational; applyAvatar doesn't regenerate them.
    const home = freshHome();
    writeGeneratedPolicy(home, "pilot-policy-old");
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-05T00:00:00Z",
        extensions: ["pilot-policy-new"],
        packSources: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home);
    expect(report).not.toBeNull();
    // The old extension file should still be on disk; no new one.
    expect(report!.steps.some((s) => s.action === "install-pack")).toBe(false);
    expect(report!.steps.some((s) => s.action === "activate-profile")).toBe(
      false,
    );
  });

  // ─── dry-run (v0.5.3+) ──────────────────────────────────

  it("dry-run: reports would-install + would-activate without side-effects", async () => {
    const home = freshHome();
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-06T00:00:00Z",
        profile: "pi-architect",
        packSources: ["npm:foo", "npm:bar"],
        extensions: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home, { dry: true });
    expect(report).not.toBeNull();
    // Same shape as a real apply — UI can reuse the banner.
    expect(report!.installed).toEqual(["npm:foo", "npm:bar"]);
    expect(report!.activated).toBe("pi-architect");
    // Root is flagged dry.
    expect(report!.dry).toBe(true);
    // Every step is flagged dry.
    expect(report!.steps.every((s) => s.dry === true)).toBe(true);
    // No side-effect calls happened.
    expect(mockRunPiStreaming).not.toHaveBeenCalled();
    expect(mockWriteActiveProfile).not.toHaveBeenCalled();
    // Steps still carry the would-* intent in their messages.
    const installSteps = report!.steps.filter(
      (s) => s.action === "install-pack",
    );
    expect(installSteps.every((s) => s.message?.includes("dry run"))).toBe(
      true,
    );
  });

  it("dry-run: returns null when no Avatar exists", async () => {
    const home = freshHome();
    expect(await applyAvatar("--ghost--", home, { dry: true })).toBeNull();
  });

  it("dry-run: skips when current state already matches (still dry)", async () => {
    const home = freshHome();
    writePiSettings(home, ["npm:foo"]);
    writeProfile(home, "pi-architect", {});
    writeActiveProfile(home, "pi-architect");
    await writeAvatar(
      {
        encodedCwd: "--proj--",
        capturedAt: "2026-07-06T00:00:00Z",
        profile: "pi-architect",
        packSources: ["npm:foo"],
        extensions: [],
      },
      home,
    );

    const report = await applyAvatar("--proj--", home, { dry: true });
    expect(report).not.toBeNull();
    expect(report!.installed).toEqual([]);
    expect(report!.activated).toBeUndefined();
    expect(report!.dry).toBe(true);
    expect(mockRunPiStreaming).not.toHaveBeenCalled();
    expect(mockWriteActiveProfile).not.toHaveBeenCalled();
  });
});

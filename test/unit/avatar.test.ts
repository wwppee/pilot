/**
 * avatar.test.ts — coverage for core/avatar.ts.
 *
 * Each test writes a fake Pilot state into a fresh tmpdir and
 * asserts captureAvatar / readAvatar / diffAvatar behave correctly.
 */

import { describe, it, expect, beforeEach } from "vitest";
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
    "utf-8",
  );
}

function writePiSettings(home: string, sources: string[]): void {
  const dir = join(home, ".pi", "agent");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify(
      {
        sources: sources.map((source) => ({ source, enabled: true })),
      },
      null,
      2,
    ) + "\n",
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

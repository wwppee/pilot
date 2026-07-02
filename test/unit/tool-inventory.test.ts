/**
 * Tests for `core/tool-inventory.ts`.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listToolInventory } from "../../src/core/tool-inventory.js";
import { piAgentDir } from "../../src/core/types.js";

/** Build a fake ~/.pi/agent/ tree with npm/package.json + node_modules. */
function buildHomeWithNpm(
  pkgs: Array<{ name: string; version: string; description?: string }>,
): string {
  const home = mkdtempSync(join(tmpdir(), "pilot-tools-"));
  const agent = piAgentDir(home);
  mkdirSync(join(agent, "npm", "node_modules"), { recursive: true });
  writeFileSync(
    join(agent, "npm", "package.json"),
    JSON.stringify({
      name: "pi-extensions",
      private: true,
      dependencies: Object.fromEntries(
        pkgs.map((p) => [p.name, `^${p.version}`]),
      ),
    }),
  );
  for (const p of pkgs) {
    const pkgDir = join(agent, "npm", "node_modules", p.name);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: p.name,
        version: p.version,
        ...(p.description ? { description: p.description } : {}),
      }),
    );
  }
  return home;
}

describe("tool-inventory (v0.4.2)", () => {
  it("returns 7 built-in tools for an empty home", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-tools-"));
    try {
      const items = await listToolInventory(home);
      const builtIns = items.filter((t) => t.source === "built-in");
      expect(builtIns).toHaveLength(7);
      const names = builtIns.map((t) => t.name).sort();
      expect(names).toEqual([
        "bash",
        "edit",
        "find",
        "grep",
        "ls",
        "read",
        "write",
      ]);
      // All built-ins enabled
      expect(builtIns.every((t) => t.enabled && t.installed)).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("classifies safety correctly per built-in", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-tools-"));
    try {
      const items = await listToolInventory(home);
      const byName = Object.fromEntries(items.map((t) => [t.name, t]));
      expect(byName["read"]?.safety).toBe("read");
      expect(byName["write"]?.safety).toBe("write");
      expect(byName["edit"]?.safety).toBe("write");
      expect(byName["bash"]?.safety).toBe("exec");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("includes npm-installed extensions", async () => {
    const home = buildHomeWithNpm([
      {
        name: "pi-subagents",
        version: "0.32.0",
        description: "Pi extension for delegating to subagents",
      },
    ]);
    try {
      const items = await listToolInventory(home);
      const npmItems = items.filter((t) => t.source === "npm");
      expect(npmItems).toHaveLength(1);
      expect(npmItems[0]?.name).toBe("pi-subagents");
      expect(npmItems[0]?.description).toBe(
        "Pi extension for delegating to subagents",
      );
      expect(npmItems[0]?.packageName).toBe("pi-subagents");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("handles missing npm/package.json gracefully (no crash)", async () => {
    const home = mkdtempSync(join(tmpdir(), "pilot-tools-"));
    try {
      mkdirSync(piAgentDir(home), { recursive: true });
      // No npm/package.json created
      const items = await listToolInventory(home);
      const npmItems = items.filter((t) => t.source === "npm");
      expect(npmItems).toHaveLength(0);
      // Built-ins still present
      const builtIns = items.filter((t) => t.source === "built-in");
      expect(builtIns).toHaveLength(7);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("strips version range prefixes (^, ~)", async () => {
    const home = buildHomeWithNpm([{ name: "foo", version: "1.2.3" }]);
    try {
      const items = await listToolInventory(home);
      const foo = items.find((t) => t.name === "foo");
      expect(foo).toBeDefined();
      // Description should not include the ^ prefix
      expect(foo?.description).toContain("foo@1.2.3");
      expect(foo?.description).not.toContain("^");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("multiple npm packages come back in declaration order", async () => {
    const home = buildHomeWithNpm([
      { name: "a-pkg", version: "1.0.0" },
      { name: "b-pkg", version: "2.0.0" },
      { name: "c-pkg", version: "3.0.0" },
    ]);
    try {
      const items = await listToolInventory(home);
      const npmItems = items.filter((t) => t.source === "npm");
      expect(npmItems.map((t) => t.name)).toEqual(["a-pkg", "b-pkg", "c-pkg"]);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

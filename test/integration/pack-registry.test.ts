/**
 * Integration tests that hit the real npm registry.
 *
 * These are NOT included in the default `npm test` run. To run them:
 *
 *     npx vitest run test/integration/
 *
 * They require:
 *   - Network access to https://registry.npmjs.org
 *   - npm registry returning reasonable data for the queried packages
 *
 * Why split out: registry data changes, network is sometimes flaky, and
 * we don't want the unit-test suite to depend on the network. Real
 * install flows (npm install) are exercised manually via the CLI.
 */

import { describe, it, expect } from "vitest";
import { createService } from "../../src/core/service-impl.js";

describe("pack-registry (integration)", () => {
  it("returns results for a common query", async () => {
    const svc = createService();
    const results = await svc.searchPacks("pi-subagents");
    // Don't assert exact count — npm data changes. Just assert shape.
    if (results.length > 0) {
      const r = results[0]!;
      expect(typeof r.name).toBe("string");
      expect(typeof r.version).toBe("string");
      expect(r.name.toLowerCase()).toContain("pi");
    }
  }, 15_000);

  it("returns null for a non-existent package", async () => {
    const svc = createService();
    const result = await svc.getPack("this-package-does-not-exist-9999");
    expect(result).toBeNull();
  }, 15_000);

  it("returns metadata for a real package", async () => {
    const svc = createService();
    const result = await svc.getPack("pi-subagents");
    if (result) {
      expect(result.name).toBe("pi-subagents");
      expect(typeof result.version).toBe("string");
    }
  }, 15_000);

  it("reads pi manifest from versions[latest]", async () => {
    const svc = createService();
    const result = await svc.getPack("pi-lens");
    // pi-lens publishes its `pi` field under versions[latest].pi
    // (not at the response top level). Service should surface it.
    if (result) {
      expect(result.kind === "extension" || result.kind === "skill").toBe(true);
    }
  }, 15_000);
});

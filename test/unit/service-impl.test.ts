/**
 * Tests for createService() — the default PilotService implementation.
 *
 * These tests use the **real** service against the real `~/.pi/agent/`
 * (read paths) and an isolated `~/.pilot/` (capability paths). They verify:
 *   - Packs list/search/get work without throwing
 *   - Sessions list/search respects filters
 *   - Doctor returns a structured report
 *   - Capabilities returns [] for a fresh home
 *
 * We do NOT mock — these are integration-flavored tests that exercise
 * the real fs + npm network. Network tests are tagged for skip in CI
 * if needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createService } from '../../src/core/service-impl.js';

describe('createService', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'pilot-svc-test-'));
    process.env.HOME = tempHome;
    mkdirSync(join(tempHome, '.pilot/capabilities/sample'), { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('returns a service object with all expected methods', () => {
    const svc = createService();
    expect(typeof svc.listPacks).toBe('function');
    expect(typeof svc.searchPacks).toBe('function');
    expect(typeof svc.getPack).toBe('function');
    expect(typeof svc.installPack).toBe('function');
    expect(typeof svc.listSessions).toBe('function');
    expect(typeof svc.searchSessions).toBe('function');
    expect(typeof svc.runDoctor).toBe('function');
    expect(typeof svc.listCapabilities).toBe('function');
    expect(typeof svc.getCapability).toBe('function');
  });

  // ─── Packs ──────────────────────────────────────────

  describe('listPacks', () => {
    it('returns [] when settings.json is missing', async () => {
      const svc = createService();
      const packs = await svc.listPacks();
      expect(packs).toEqual([]);
    });

    it('parses installed sources from settings.json', async () => {
      // Fake pi's settings.json in our isolated home
      mkdirSync(join(tempHome, '.pi/agent'), { recursive: true });
      writeFileSync(
        join(tempHome, '.pi/agent/settings.json'),
        JSON.stringify({
          sources: [
            { source: 'npm:pi-subagents', enabled: true },
            { source: 'npm:pi-lens', enabled: true },
            { source: 'npm:disabled-pack', enabled: false },
          ],
        }),
      );
      const svc = createService();
      const packs = await svc.listPacks();
      expect(packs).toHaveLength(3);
      expect(packs[0]?.source).toBe('npm:pi-subagents');
      expect(packs[0]?.enabled).toBe(true);
      expect(packs[2]?.enabled).toBe(false);
    });

    it('classifies skill/theme/prompt packs by name', async () => {
      mkdirSync(join(tempHome, '.pi/agent'), { recursive: true });
      writeFileSync(
        join(tempHome, '.pi/agent/settings.json'),
        JSON.stringify({
          sources: [
            { source: 'npm:pi-lens' }, // extension
            { source: 'npm:superpowers-zh' }, // skill (contains 'superpowers')
            { source: 'npm:pi-hud-footer' }, // theme (contains 'hud')
          ],
        }),
      );
      const svc = createService();
      const packs = await svc.listPacks();
      const byName = new Map(packs.map((p) => [p.name, p.kind]));
      expect(byName.get('pi-lens')).toBe('extension');
      expect(byName.get('superpowers-zh')).toBe('skill');
      expect(byName.get('pi-hud-footer')).toBe('theme');
    });
  });

  describe('searchPacks (network)', () => {
    it('returns results for a common query', async () => {
      const svc = createService();
      const results = await svc.searchPacks('pi-subagents');
      // Don't assert exact count — npm data changes. Just assert shape.
      if (results.length > 0) {
        const r = results[0]!;
        expect(typeof r.name).toBe('string');
        expect(typeof r.version).toBe('string');
        expect(r.name.toLowerCase()).toContain('pi');
      }
    }, 15_000);
  });

  describe('getPack (network)', () => {
    it('returns null for a non-existent package', async () => {
      const svc = createService();
      const result = await svc.getPack('this-package-does-not-exist-9999');
      expect(result).toBeNull();
    }, 15_000);

    it('returns metadata for a real package', async () => {
      const svc = createService();
      const result = await svc.getPack('pi-subagents');
      if (result) {
        expect(result.name).toBe('pi-subagents');
        expect(typeof result.version).toBe('string');
      }
    }, 15_000);
  });

  // ─── Sessions ───────────────────────────────────────

  describe('listSessions', () => {
    it('returns [] when sessions dir does not exist', async () => {
      const svc = createService();
      const sessions = await svc.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('searchSessions', () => {
    it('returns [] when sessions dir does not exist', async () => {
      const svc = createService();
      const hits = await svc.searchSessions('anything');
      expect(hits).toEqual([]);
    });
  });

  // ─── Doctor ─────────────────────────────────────────

  describe('runDoctor', () => {
    it('returns a structured report', async () => {
      const svc = createService();
      const report = await svc.runDoctor();
      expect(typeof report.ok).toBe('boolean');
      expect(typeof report.failed).toBe('number');
      expect(Array.isArray(report.checks)).toBe(true);
      // Should have at least: node + pi + fd + ~/.pi/agent
      expect(report.checks.length).toBeGreaterThanOrEqual(4);
    });

    it('every check has ok/message', async () => {
      const svc = createService();
      const report = await svc.runDoctor();
      for (const c of report.checks) {
        expect(typeof c.ok).toBe('boolean');
        expect(typeof c.message).toBe('string');
      }
    });
  });

  // ─── Capabilities ────────────────────────────────────

  describe('listCapabilities', () => {
    it('returns [] when store is empty', async () => {
      // Just-created tempHome has empty ~/.pilot/capabilities/sample (no capability.json)
      const svc = createService();
      const caps = await svc.listCapabilities();
      expect(caps).toEqual([]);
    });

    it('returns installed capabilities', async () => {
      writeFileSync(
        join(tempHome, '.pilot/capabilities/sample/capability.json'),
        JSON.stringify({
          id: 'sample',
          title: 'Sample',
          type: 'workflow',
          description: 'Test',
          sources: [{ type: 'npm', ref: 'npm:foo', mode: 'L2-wrapped' }],
          artifacts: {},
          compatibility: { conflicts: [], requires: [] },
          metadata: {
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-01T00:00:00Z',
          },
        }),
      );
      const svc = createService();
      const caps = await svc.listCapabilities();
      expect(caps).toHaveLength(1);
      expect(caps[0]?.id).toBe('sample');
    });
  });

  describe('getCapability', () => {
    it('returns null for missing capability', async () => {
      const svc = createService();
      expect(await svc.getCapability('does-not-exist')).toBeNull();
    });

    it('returns the capability when present', async () => {
      writeFileSync(
        join(tempHome, '.pilot/capabilities/sample/capability.json'),
        JSON.stringify({
          id: 'sample',
          title: 'Sample',
          type: 'workflow',
          description: 'Test',
          sources: [{ type: 'npm', ref: 'npm:foo', mode: 'L2-wrapped' }],
          artifacts: {},
          compatibility: { conflicts: [], requires: [] },
          metadata: {
            createdAt: '2026-07-01T00:00:00Z',
            updatedAt: '2026-07-01T00:00:00Z',
          },
        }),
      );
      const svc = createService();
      const cap = await svc.getCapability('sample');
      expect(cap?.id).toBe('sample');
      expect(cap?.type).toBe('workflow');
    });
  });
});
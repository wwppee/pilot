import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CapabilitySchema,
  capabilityDir,
  loadCapability,
  listCapabilities,
  tryLoadCapability,
} from '../../src/core/capability.js';

// ─── Fixtures ────────────────────────────────────────────────

const VALID_CAPABILITY = {
  id: 'plan-mode',
  title: 'Plan Mode',
  type: 'workflow',
  description: 'Plan before executing, wait for approval',
  sources: [
    { type: 'npm', ref: 'npm:pi-subagents', mode: 'L2-wrapped' },
  ],
  artifacts: { extensions: ['npm:pi-subagents'] },
  compatibility: { conflicts: [], requires: ['node>=20'] },
  metadata: {
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    inspiredBy: ['Claude Code'],
  },
};

// ─── capabilityDir ──────────────────────────────────────────

describe('capabilityDir', () => {
  it('returns path for valid kebab-case id', () => {
    expect(capabilityDir('plan-mode')).toMatch(/capabilities[/\\]plan-mode$/);
    expect(capabilityDir('subagent-orchestrator')).toMatch(/subagent-orchestrator$/);
    expect(capabilityDir('todo')).toMatch(/capabilities[/\\]todo$/);
  });

  it('throws on invalid ids', () => {
    expect(() => capabilityDir('Plan Mode')).toThrow(/Invalid capability id/);
    expect(() => capabilityDir('PlanMode')).toThrow(); // PascalCase
    expect(() => capabilityDir('plan_mode')).toThrow(); // underscores not allowed
    expect(() => capabilityDir('-leading-dash')).toThrow();
    expect(() => capabilityDir('trailing-dash-')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => capabilityDir('')).toThrow();
  });

  it('throws on consecutive dashes', () => {
    expect(() => capabilityDir('plan--mode')).toThrow();
  });
});

// ─── CapabilitySchema ───────────────────────────────────────

describe('CapabilitySchema', () => {
  it('accepts a fully-valid capability', () => {
    expect(() => CapabilitySchema.parse(VALID_CAPABILITY)).not.toThrow();
  });

  it('rejects non-kebab-case id', () => {
    const bad = { ...VALID_CAPABILITY, id: 'PlanMode' };
    expect(() => CapabilitySchema.parse(bad)).toThrow();
  });

  it('rejects id with spaces', () => {
    expect(() => CapabilitySchema.parse({ ...VALID_CAPABILITY, id: 'plan mode' })).toThrow();
  });

  it('rejects invalid type', () => {
    expect(() =>
      CapabilitySchema.parse({ ...VALID_CAPABILITY, type: 'magic' }),
    ).toThrow();
  });

  it('rejects empty sources array', () => {
    expect(() =>
      CapabilitySchema.parse({ ...VALID_CAPABILITY, sources: [] }),
    ).toThrow();
  });

  it('accepts all 4 L1..L4 modes', () => {
    for (const mode of ['L1-referenced', 'L2-wrapped', 'L3-distilled', 'L4-native'] as const) {
      const c = {
        ...VALID_CAPABILITY,
        sources: [{ type: 'npm' as const, ref: 'npm:foo', mode }],
      };
      expect(() => CapabilitySchema.parse(c)).not.toThrow();
    }
  });

  it('rejects unknown mode', () => {
    const c = {
      ...VALID_CAPABILITY,
      sources: [{ type: 'npm' as const, ref: 'npm:foo', mode: 'L5-future' }],
    };
    expect(() => CapabilitySchema.parse(c)).toThrow();
  });

  it('rejects eval.score > 1', () => {
    const c = {
      ...VALID_CAPABILITY,
      eval: { score: 1.5, lastRun: '2026-07-01T00:00:00Z', fixtureCount: 5 },
    };
    expect(() => CapabilitySchema.parse(c)).toThrow();
  });

  it('rejects eval.score < 0', () => {
    const c = {
      ...VALID_CAPABILITY,
      eval: { score: -0.1, lastRun: '2026-07-01T00:00:00Z', fixtureCount: 5 },
    };
    expect(() => CapabilitySchema.parse(c)).toThrow();
  });

  it('accepts eval.score at boundaries 0 and 1', () => {
    for (const score of [0, 1]) {
      const c = {
        ...VALID_CAPABILITY,
        eval: { score, lastRun: '2026-07-01T00:00:00Z', fixtureCount: 0 },
      };
      expect(() => CapabilitySchema.parse(c)).not.toThrow();
    }
  });

  it('rejects non-ISO datetime in eval.lastRun', () => {
    const c = {
      ...VALID_CAPABILITY,
      eval: { score: 0.5, lastRun: 'yesterday', fixtureCount: 5 },
    };
    expect(() => CapabilitySchema.parse(c)).toThrow();
  });

  it('default conflicts and requires to []', () => {
    const noCompat = { ...VALID_CAPABILITY };
    // @ts-expect-error intentionally dropping field to test default
    delete noCompat.compatibility;
    const parsed = CapabilitySchema.parse(noCompat);
    expect(parsed.compatibility.conflicts).toEqual([]);
    expect(parsed.compatibility.requires).toEqual([]);
  });

  it('accepts all 4 source types', () => {
    for (const type of ['npm', 'git', 'local', 'pilot-native'] as const) {
      const c = {
        ...VALID_CAPABILITY,
        sources: [{ type, ref: 'npm:foo', mode: 'L1-referenced' as const }],
      };
      expect(() => CapabilitySchema.parse(c)).not.toThrow();
    }
  });
});

// ─── loadCapability / listCapabilities ──────────────────────

describe('loadCapability + listCapabilities', () => {
  let tempHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    tempHome = mkdtempSync(join(tmpdir(), 'pilot-cap-test-'));
    process.env.HOME = tempHome;
    mkdirSync(join(tempHome, '.pilot/capabilities/plan-mode'), { recursive: true });
    mkdirSync(join(tempHome, '.pilot/capabilities/broken'), { recursive: true });
    mkdirSync(join(tempHome, '.pilot/capabilities/empty'), { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    rmSync(tempHome, { recursive: true, force: true });
  });

  it('loadCapability parses a valid capability.json', async () => {
    writeFileSync(
      join(tempHome, '.pilot/capabilities/plan-mode/capability.json'),
      JSON.stringify(VALID_CAPABILITY),
    );
    const cap = await loadCapability('plan-mode', tempHome);
    expect(cap.id).toBe('plan-mode');
    expect(cap.title).toBe('Plan Mode');
    expect(cap.sources[0]?.mode).toBe('L2-wrapped');
  });

  it('loadCapability throws on malformed JSON', async () => {
    writeFileSync(
      join(tempHome, '.pilot/capabilities/broken/capability.json'),
      '{ not json',
    );
    await expect(loadCapability('broken', tempHome)).rejects.toThrow();
  });

  it('loadCapability throws on schema mismatch', async () => {
    writeFileSync(
      join(tempHome, '.pilot/capabilities/broken/capability.json'),
      JSON.stringify({ id: 'Broken', title: 'X' }), // missing many required fields
    );
    await expect(loadCapability('broken', tempHome)).rejects.toThrow();
  });

  it('tryLoadCapability returns null on error', async () => {
    expect(await tryLoadCapability('does-not-exist', tempHome)).toBeNull();
    writeFileSync(
      join(tempHome, '.pilot/capabilities/broken/capability.json'),
      'garbage',
    );
    expect(await tryLoadCapability('broken', tempHome)).toBeNull();
  });

  it('listCapabilities skips broken ones, includes valid ones', async () => {
    writeFileSync(
      join(tempHome, '.pilot/capabilities/plan-mode/capability.json'),
      JSON.stringify(VALID_CAPABILITY),
    );
    writeFileSync(
      join(tempHome, '.pilot/capabilities/broken/capability.json'),
      'not json',
    );
    // empty/ has no capability.json — should be skipped

    const caps = await listCapabilities(tempHome);
    expect(caps).toHaveLength(1);
    expect(caps[0]?.id).toBe('plan-mode');
  });

  it('listCapabilities returns [] when home has no capabilities dir', async () => {
    const emptyHome = mkdtempSync(join(tmpdir(), 'pilot-cap-empty-'));
    try {
      const caps = await listCapabilities(emptyHome);
      expect(caps).toEqual([]);
    } finally {
      rmSync(emptyHome, { recursive: true, force: true });
    }
  });
});
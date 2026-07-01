import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  classifyByName,
  classifyFromManifest,
  clearManifestCache,
  PackManifestSchema,
  readPackManifest,
  readPackManifestCached,
} from '../../src/core/pack-manifest.js';

// ─── PackManifestSchema ─────────────────────────────────

describe('PackManifestSchema', () => {
  it('accepts a valid manifest with pi.kind', () => {
    const m = PackManifestSchema.parse({
      name: 'pi-subagents',
      version: '0.31.0',
      pi: { kind: 'extension' },
    });
    expect(m.pi?.kind).toBe('extension');
  });

  it('accepts a manifest without pi field', () => {
    const m = PackManifestSchema.parse({ name: 'foo', version: '1.0.0' });
    expect(m.pi).toBeUndefined();
  });

  it('accepts all 4 kinds', () => {
    for (const kind of ['extension', 'skill', 'theme', 'prompt'] as const) {
      const m = PackManifestSchema.parse({ name: 'x', version: '1', pi: { kind } });
      expect(m.pi?.kind).toBe(kind);
    }
  });

  it('rejects unknown kind', () => {
    expect(() =>
      PackManifestSchema.parse({ name: 'x', version: '1', pi: { kind: 'magic' } }),
    ).toThrow();
  });

  it('accepts extension as string or array', () => {
    const a = PackManifestSchema.parse({ name: 'x', version: '1', pi: { extension: 'dist/a.js' } });
    expect(a.pi?.extension).toBe('dist/a.js');
    const b = PackManifestSchema.parse({ name: 'x', version: '1', pi: { extension: ['a.js', 'b.js'] } });
    expect(b.pi?.extension).toEqual(['a.js', 'b.js']);
  });

  it('accepts all artifact arrays', () => {
    const m = PackManifestSchema.parse({
      name: 'x',
      version: '1',
      pi: {
        kind: 'extension',
        extension: 'dist/a.js',
        skills: ['s1'],
        prompts: ['p1'],
        themes: ['t1'],
        commands: ['cmd'],
        keybindings: ['Ctrl+L'],
      },
    });
    expect(m.pi?.skills).toEqual(['s1']);
    expect(m.pi?.prompts).toEqual(['p1']);
    expect(m.pi?.themes).toEqual(['t1']);
    expect(m.pi?.commands).toEqual(['cmd']);
    expect(m.pi?.keybindings).toEqual(['Ctrl+L']);
  });
});

// ─── readPackManifest (network) ───────────────────────────

describe('readPackManifest', () => {
  beforeEach(() => {
    clearManifestCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null for a 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      })) as never,
    );
    const result = await readPackManifest('this-pkg-does-not-exist-zzz');
    expect(result).toBeNull();
  });

  it('parses a manifest from the registry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'pi-subagents',
          'dist-tags': { latest: '0.31.0' },
          description: 'Subagent delegation',
          pi: { kind: 'extension', commands: ['delegate'] },
        }),
      })) as never,
    );
    const m = await readPackManifest('pi-subagents');
    expect(m?.name).toBe('pi-subagents');
    expect(m?.version).toBe('0.31.0');
    expect(m?.pi?.kind).toBe('extension');
    expect(m?.pi?.commands).toEqual(['delegate']);
  });

  it('handles missing pi field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'legacy-pkg',
          'dist-tags': { latest: '1.0.0' },
        }),
      })) as never,
    );
    const m = await readPackManifest('legacy-pkg');
    expect(m?.pi).toBeUndefined();
  });
});

// ─── readPackManifestCached ──────────────────────────────

describe('readPackManifestCached', () => {
  beforeEach(() => {
    clearManifestCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches results across calls', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'pi-x',
        'dist-tags': { latest: '1.0.0' },
        pi: { kind: 'extension' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as never);

    await readPackManifestCached('pi-x');
    await readPackManifestCached('pi-x');
    await readPackManifestCached('pi-x');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches null results too', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', fetchMock as never);

    expect(await readPackManifestCached('nope')).toBeNull();
    expect(await readPackManifestCached('nope')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── classifyFromManifest ─────────────────────────────────

describe('classifyFromManifest', () => {
  it('uses manifest.pi.kind when present', () => {
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: { kind: 'theme' } }, 'foo'),
    ).toBe('theme');
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: { kind: 'skill' } }, 'foo'),
    ).toBe('skill');
  });

  it('uses artifact presence when kind is missing', () => {
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: { themes: ['t.json'] } }, 'foo'),
    ).toBe('theme');
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: { prompts: ['p.md'] } }, 'foo'),
    ).toBe('prompt');
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: { skills: ['s.md'] } }, 'foo'),
    ).toBe('skill');
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: { extension: 'e.js' } }, 'foo'),
    ).toBe('extension');
  });

  it('falls back to name heuristic when manifest is null', () => {
    expect(classifyFromManifest(null, 'pi-foo-skill')).toBe('skill');
    expect(classifyFromManifest(null, 'pi-hud-footer')).toBe('theme');
    expect(classifyFromManifest(null, 'pi-subagents')).toBe('extension');
  });

  it('falls back to name heuristic when manifest has empty pi', () => {
    expect(
      classifyFromManifest({ name: 'foo', version: '1', pi: {} }, 'pi-foo-skill'),
    ).toBe('skill');
  });
});

// ─── classifyByName (last-resort) ─────────────────────────

describe('classifyByName', () => {
  it('classifies skill names', () => {
    expect(classifyByName('pi-foo-skill')).toBe('skill');
    expect(classifyByName('superpowers-zh')).toBe('skill');
  });

  it('classifies theme names', () => {
    expect(classifyByName('pi-foo-theme')).toBe('theme');
    expect(classifyByName('pi-hud-footer')).toBe('theme');
  });

  it('classifies prompt names', () => {
    expect(classifyByName('pi-foo-prompt')).toBe('prompt');
  });

  it('defaults to extension', () => {
    expect(classifyByName('pi-subagents')).toBe('extension');
    expect(classifyByName('pi-lens')).toBe('extension');
  });
});
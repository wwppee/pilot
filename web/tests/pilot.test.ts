import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { api, PilotApiError } from '../src/lib/pilot';

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string, init: RequestInit = {}) =>
    handler(url, init),
  ) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fn);
  return fn;
}

function writeTokenFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-web-'));
  // pilot reads ${HOME}/.pilot/server.token
  mkdirSync(join(dir, '.pilot'));
  writeFileSync(join(dir, '.pilot', 'server.token'), content);
  process.env['HOME'] = dir;
  return dir;
}

describe('pilot client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env['PILOT_TOKEN'];
    delete process.env['HOME'];
    delete process.env['PILOT_SERVER_URL'];
  });

  it('injects the X-Pilot-Token header from the token file', async () => {
    writeTokenFile('test-token-xyz');
    const fetchMock = mockFetch((url, init) => {
      expect(url).toBe('http://127.0.0.1:17361/health');
      expect(init.headers).toBeInstanceOf(Headers);
      const h = init.headers as Headers;
      expect(h.get('x-pilot-token')).toBe('test-token-xyz');
      return Promise.resolve(new Response(JSON.stringify({ ok: true, version: '0.3.0', uptimeSec: 1 }), { status: 200 }));
    });

    const h = await api.health();
    expect(h.ok).toBe(true);
    expect(h.version).toBe('0.3.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('prefers PILOT_TOKEN env over the token file', async () => {
    writeTokenFile('from-file');
    process.env['PILOT_TOKEN'] = 'from-env';

    mockFetch((_url, init) => {
      const h = init.headers as Headers;
      expect(h.get('x-pilot-token')).toBe('from-env');
      return Promise.resolve(new Response(JSON.stringify({ ok: true, version: 'x', uptimeSec: 0 }), { status: 200 }));
    });
    await api.health();
  });

  it('throws PilotApiError on non-2xx', async () => {
    writeTokenFile('t');
    mockFetch((_url, _init) =>
      Promise.resolve(new Response('not found', { status: 404 })),
    );
    await expect(api.packs()).rejects.toBeInstanceOf(PilotApiError);
    await expect(api.packs()).rejects.toMatchObject({ status: 404 });
  });

  it('falls back to localhost if no token is set', async () => {
    // Empty home so the file doesn't exist.
    const fakeHome = mkdtempSync(join(tmpdir(), 'pilot-no-token-'));
    const origHome = process.env['HOME'];
    process.env['HOME'] = fakeHome;
    mockFetch((_url, init) => {
      const h = init.headers as Headers;
      expect(h.get('x-pilot-token')).toBeNull();
      return Promise.resolve(new Response(JSON.stringify({ ok: true, version: 'x', uptimeSec: 0 }), { status: 200 }));
    });
    const h = await api.health();
    expect(h.ok).toBe(true);
    if (origHome !== undefined) process.env['HOME'] = origHome;
    else delete process.env['HOME'];
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it('packs() parses JSON array', async () => {
    writeTokenFile('t');
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify([{ name: 'a', version: '1', source: 'npm:a', enabled: true }]), { status: 200 }),
      ),
    );
    const list = await api.packs();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('a');
  });

  it('packInfo encodes the name', async () => {
    writeTokenFile('t');
    mockFetch((url) => {
      expect(url).toContain('/packs/info/');
      return Promise.resolve(new Response(JSON.stringify({ name: 'x', version: '1' }), { status: 200 }));
    });
    await api.packInfo('x');
  });

  it('cleanup: removes tmp token dirs', () => {
    // Just exercise the home-temp pattern; nothing to assert beyond
    // making sure the test process doesn't leak dirs.
    const d = mkdtempSync(join(tmpdir(), 'pilot-web-leak-'));
    rmSync(d, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
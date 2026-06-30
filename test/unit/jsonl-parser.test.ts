import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSessionInfo, searchSession } from '../../src/core/jsonl-parser.js';

describe('jsonl-parser', () => {
  it('reads session info from a valid JSONL file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const entries = [
        { id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'hello' } },
        { id: 'b', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { model: 'claude-opus-4.6', text: 'hi' } },
        { id: 'c', parentId: 'b', type: 'tool', timestamp: '2026-06-30T10:00:06Z', data: { name: 'read' } },
      ];
      writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));

      const info = await readSessionInfo(path, 'session');
      expect(info.entries).toBe(3);
      expect(info.startedAt).toBe('2026-06-30T10:00:00Z');
      expect(info.lastUsedAt).toBe('2026-06-30T10:00:06Z');
      expect(info.model).toBe('claude-opus-4.6');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips malformed lines without throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const content = [
        JSON.stringify({ id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z' }),
        'this is not json',
        JSON.stringify({ id: 'b', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { model: 'gpt-5' } }),
      ].join('\n');
      writeFileSync(path, content);

      const info = await readSessionInfo(path, 'session');
      expect(info.entries).toBe(2); // only valid lines
      expect(info.model).toBe('gpt-5');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('searchSession finds matches case-insensitively by default', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const content = [
        JSON.stringify({ id: 'a', type: 'user', data: { text: 'add JWT auth middleware' } }),
        JSON.stringify({ id: 'b', type: 'assistant', data: { text: 'adding jwt middleware' } }),
        JSON.stringify({ id: 'c', type: 'tool', data: { name: 'read', path: 'src/server.ts' } }),
      ].join('\n');
      writeFileSync(path, content);

      const count = await searchSession(path, 'jwt');
      expect(count).toBe(2); // first two entries match
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('searchSession is case-sensitive when --case flag is passed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const content = [
        JSON.stringify({ id: 'a', type: 'user', data: { text: 'JWT auth' } }),
        JSON.stringify({ id: 'b', type: 'assistant', data: { text: 'jwt lower' } }),
      ].join('\n');
      writeFileSync(path, content);

      expect(await searchSession(path, 'JWT', true)).toBe(1);
      expect(await searchSession(path, 'jwt', true)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 0 for empty file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      writeFileSync(path, '');
      const count = await searchSession(path, 'anything');
      expect(count).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSessionInfo, readSessionTree, searchSession } from '../../src/core/jsonl-parser.js';

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

// ─── readSessionTree ───────────────────────────────────────

describe('readSessionTree', () => {
  it('builds a linear tree from a single-chain session', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const entries = [
        { id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'hello' } },
        { id: 'b', parentId: 'a', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { model: 'claude-opus-4.6', text: 'hi' } },
        { id: 'c', parentId: 'b', type: 'user', timestamp: '2026-06-30T10:00:10Z', data: { text: 'how are you' } },
        { id: 'd', parentId: 'c', type: 'assistant', timestamp: '2026-06-30T10:00:15Z', data: { model: 'claude-opus-4.6', text: 'fine' } },
      ];
      writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));

      const tree = await readSessionTree(path, 'session');
      expect(tree.totalNodes).toBe(4);
      expect(tree.maxDepth).toBe(3);
      expect(tree.models).toEqual(['claude-opus-4.6']);
      expect(tree.branchPoints).toEqual([]);
      expect(tree.root.id).toBe('a');
      expect(tree.root.children[0]?.id).toBe('b');
      expect(tree.root.children[0]?.children[0]?.id).toBe('c');
      expect(tree.root.children[0]?.children[0]?.children[0]?.id).toBe('d');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects branch points (parent with >1 child)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const entries = [
        { id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'question' } },
        { id: 'b', parentId: 'a', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { text: 'answer v1' } },
        { id: 'c', parentId: 'b', type: 'user', timestamp: '2026-06-30T10:00:10Z', data: { text: 'rephrase' } },
        { id: 'd', parentId: 'b', type: 'user', timestamp: '2026-06-30T10:00:11Z', data: { text: 'alt rephrase' } },
        { id: 'e', parentId: 'c', type: 'assistant', timestamp: '2026-06-30T10:00:15Z', data: { text: 'rephrased' } },
      ];
      writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));

      const tree = await readSessionTree(path, 'session');
      expect(tree.totalNodes).toBe(5);
      expect(tree.branchPoints).toContain('b');
      expect(tree.root.id).toBe('a');
      // b has 2 children
      const bNode = tree.root.children[0]!;
      expect(bNode.children).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts preview text from user/assistant messages', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const longText = 'a'.repeat(200);
      const entries = [
        { id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: longText } },
        { id: 'b', parentId: 'a', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { text: 'reply' } },
      ];
      writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));

      const tree = await readSessionTree(path, 'session');
      expect(tree.root.preview).toBeDefined();
      expect(tree.root.preview!.length).toBeLessThanOrEqual(100);
      expect(tree.root.preview!.endsWith('...')).toBe(true);
      expect(tree.root.children[0]?.preview).toBe('reply');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('extracts preview from tool calls', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const entries = [
        { id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'read foo' } },
        { id: 'b', parentId: 'a', type: 'tool', timestamp: '2026-06-30T10:00:05Z', data: { name: 'read', path: 'src/server.ts' } },
      ];
      writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));

      const tree = await readSessionTree(path, 'session');
      expect(tree.root.children[0]?.preview).toBe('read: src/server.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty root for empty file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      writeFileSync(path, '');
      const tree = await readSessionTree(path, 'empty');
      expect(tree.totalNodes).toBe(0);
      expect(tree.maxDepth).toBe(0);
      expect(tree.root.id).toBe('empty');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips malformed lines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const content = [
        JSON.stringify({ id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'hi' } }),
        '{ broken',
        JSON.stringify({ id: 'b', parentId: 'a', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { text: 'ok' } }),
      ].join('\n');
      writeFileSync(path, content);
      const tree = await readSessionTree(path, 'session');
      expect(tree.totalNodes).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('collects unique models', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilot-test-'));
    try {
      const path = join(dir, 'session.jsonl');
      const entries = [
        { id: 'a', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'q1' } },
        { id: 'b', parentId: 'a', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { model: 'claude-opus-4.6', text: 'a' } },
        { id: 'c', parentId: 'b', type: 'user', timestamp: '2026-06-30T10:00:10Z', data: { text: 'q2' } },
        { id: 'd', parentId: 'c', type: 'assistant', timestamp: '2026-06-30T10:00:15Z', data: { model: 'gpt-5', text: 'b' } },
        { id: 'e', parentId: 'd', type: 'user', timestamp: '2026-06-30T10:00:20Z', data: { text: 'q3' } },
        { id: 'f', parentId: 'e', type: 'assistant', timestamp: '2026-06-30T10:00:25Z', data: { model: 'claude-opus-4.6', text: 'c' } },
      ];
      writeFileSync(path, entries.map((e) => JSON.stringify(e)).join('\n'));

      const tree = await readSessionTree(path, 'session');
      expect(tree.models.sort()).toEqual(['claude-opus-4.6', 'gpt-5']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { aggregateStats } from '../../src/core/stats.js';
import { piSessionsDir } from '../../src/core/types.js';

function writeSession(home: string, cwd: string, id: string, entries: unknown[]): void {
  const dir = piSessionsDir(home) + sep + cwd;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.jsonl`), entries.map((e) => JSON.stringify(e)).join('\n'));
}

describe('stats.aggregateStats', () => {
  let home: string;

  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), 'pilot-stats-'));
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('returns zero when no sessions dir exists', async () => {
    const emptyHome = mkdtempSync(join(tmpdir(), 'pilot-empty-'));
    try {
      const r = await aggregateStats({ kind: 'all' }, emptyHome);
      expect(r.totalSessions).toBe(0);
      expect(r.totalMessages).toBe(0);
      expect(r.totalToolCalls).toBe(0);
      expect(r.byModel).toEqual([]);
      expect(r.byTool).toEqual([]);
      expect(r.byDay).toEqual([]);
    } finally {
      rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  it('aggregates messages, tool calls, models, tools, days', async () => {
    // CWD encoded with /Users/test/project
    const cwd = encodeURIComponent('/Users/test/project');
    writeSession(home, cwd, 'a', [
      { id: '1', type: 'user', timestamp: '2026-06-30T10:00:00Z', data: { text: 'hi' } },
      { id: '2', type: 'assistant', timestamp: '2026-06-30T10:00:05Z', data: { model: 'claude-opus-4.6' } },
      { id: '3', parentId: '2', type: 'tool', timestamp: '2026-06-30T10:00:06Z', data: { name: 'read' } },
      { id: '4', parentId: '2', type: 'tool', timestamp: '2026-06-30T10:00:07Z', data: { name: 'bash' } },
      { id: '5', type: 'assistant', timestamp: '2026-06-30T10:00:08Z', data: { model: 'claude-opus-4.6' } },
    ]);
    writeSession(home, cwd, 'b', [
      { id: '1', type: 'user', timestamp: '2026-07-01T09:00:00Z', data: { text: 'yo' } },
      { id: '2', type: 'assistant', timestamp: '2026-07-01T09:00:05Z', data: { model: 'gpt-5' } },
      { id: '3', parentId: '2', type: 'tool', timestamp: '2026-07-01T09:00:06Z', data: { name: 'read' } },
    ]);

    const r = await aggregateStats({ kind: 'all' }, home);

    expect(r.totalSessions).toBe(2);
    expect(r.totalMessages).toBe(8);
    expect(r.totalToolCalls).toBe(3);

    expect(r.byModel).toEqual([
      { model: 'claude-opus-4.6', messages: 2, toolCalls: 0 },
      { model: 'gpt-5', messages: 1, toolCalls: 0 },
    ]);
    expect(r.byTool).toEqual([
      { tool: 'read', count: 2 },
      { tool: 'bash', count: 1 },
    ]);
    expect(r.byDay).toEqual([
      { date: '2026-06-30', messages: 5, toolCalls: 2 },
      { date: '2026-07-01', messages: 3, toolCalls: 1 },
    ]);
  });

  it('extracts model from nested metadata', async () => {
    const cwd2 = encodeURIComponent('/Users/test/other');
    writeSession(home, cwd2, 'c', [
      { id: '1', type: 'user', timestamp: '2026-07-02T10:00:00Z', data: {} },
      { id: '2', type: 'assistant', timestamp: '2026-07-02T10:00:05Z', data: { metadata: { model: 'o3' } } },
    ]);

    const r = await aggregateStats({ kind: 'all' }, home);
    expect(r.byModel).toContainEqual({ model: 'o3', messages: 1, toolCalls: 0 });
  });

  it('extracts tool from .name / .tool / .function.name', async () => {
    const cwd3 = encodeURIComponent('/Users/test/three');
    writeSession(home, cwd3, 'd', [
      { id: '1', type: 'user', timestamp: '2026-07-03T10:00:00Z' },
      { id: '2', parentId: '1', type: 'tool', timestamp: '2026-07-03T10:00:01Z', data: { tool: 'edit' } },
      { id: '3', parentId: '1', type: 'tool', timestamp: '2026-07-03T10:00:02Z', data: { function: { name: 'grep' } } },
      { id: '4', parentId: '1', type: 'tool', timestamp: '2026-07-03T10:00:03Z', data: { name: 'read' } },
    ]);

    const r = await aggregateStats({ kind: 'all' }, home);
    const tools = r.byTool.map((t) => t.tool).sort();
    expect(tools).toContain('edit');
    expect(tools).toContain('grep');
    expect(tools).toContain('read');
  });

  it('filters sessions by date range', async () => {
    const r = await aggregateStats({ kind: 'lastDays', days: 30 }, home);
    // All 4 sessions are within the last 30 days from 'now' (test runs in real time).
    expect(r.totalSessions).toBe(4);
  });
});
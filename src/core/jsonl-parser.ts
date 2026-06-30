/**
 * Stream-based JSONL parser for pi session files.
 *
 * Pi sessions are JSONL files: each line is a JSON object with `id` and
 * optional `parentId`, forming a DAG. We don't load the whole file when
 * callers only need metadata — we stream and aggregate as we go.
 */

import { createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { SessionEntry, SessionInfo } from './types.js';

/**
 * Read session entries one at a time (streaming).
 *
 * Skips malformed lines rather than throwing — pi sessions occasionally
 * contain partial writes from interrupted runs.
 */
export async function* readEntries(filePath: string): AsyncIterable<SessionEntry> {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed) as SessionEntry;
      yield entry;
    } catch {
      // Skip malformed lines silently.
    }
  }
}

/**
 * Extract lightweight metadata about a session without loading every entry.
 *
 * Stops reading as soon as it has the model + entry count + timestamps,
 * which is usually within the first ~50 lines for normal sessions.
 */
export async function readSessionInfo(filePath: string, id: string): Promise<SessionInfo> {
  let entries = 0;
  let startedAt: string | undefined;
  let lastUsedAt: string | undefined;
  let model: string | undefined;

  for await (const entry of readEntries(filePath)) {
    entries += 1;

    if (!startedAt && entry.timestamp) startedAt = entry.timestamp;
    if (entry.timestamp) lastUsedAt = entry.timestamp;

    // First assistant message usually carries the model name in data.
    if (!model && entry.type === 'assistant') {
      const m = extractModel(entry.data);
      if (m) model = m;
    }
  }

  const stat = statSync(filePath);
  return {
    path: filePath,
    id,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
    entries,
    ...(model !== undefined ? { model } : {}),
    sizeBytes: stat.size,
  };
}

/**
 * Best-effort extraction of the model name from an assistant entry's data.
 *
 * Pi's session format is documented in `packages/coding-agent/docs/session-format.md`.
 * We probe a few common shapes; if none match, return undefined.
 */
function extractModel(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const obj = data as Record<string, unknown>;

  // Common shapes: { model: "..." } or { metadata: { model: "..." } }
  if (typeof obj['model'] === 'string') return obj['model'];
  const metadata = obj['metadata'];
  if (metadata && typeof metadata === 'object') {
    const m = (metadata as Record<string, unknown>)['model'];
    if (typeof m === 'string') return m;
  }
  return undefined;
}

/**
 * Search all entries in a session for a substring match.
 *
 * Returns the number of matches. Cheap to compute — only the JSON-stringified
 * entry is searched, not deep traversal.
 */
export async function searchSession(
  filePath: string,
  query: string,
  caseSensitive = false,
): Promise<number> {
  const needle = caseSensitive ? query : query.toLowerCase();
  let hits = 0;

  for await (const entry of readEntries(filePath)) {
    const haystack = caseSensitive
      ? JSON.stringify(entry)
      : JSON.stringify(entry).toLowerCase();
    if (haystack.includes(needle)) hits += 1;
  }
  return hits;
}
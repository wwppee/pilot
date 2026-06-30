/**
 * Sessions directory scanner.
 *
 * Lists all `.jsonl` files under `~/.pi/agent/sessions/<encoded-cwd>/`
 * and returns SessionInfo for each.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { PI_SESSIONS_DIR } from './types.js';
import { readSessionInfo } from './jsonl-parser.js';
import type { SessionInfo } from './types.js';

/**
 * Recursively walk the sessions dir and return info for every .jsonl file.
 *
 * If the directory doesn't exist, returns [] (no sessions yet is normal).
 */
export async function listAllSessions(): Promise<SessionInfo[]> {
  const results: SessionInfo[] = [];

  if (!(await exists(PI_SESSIONS_DIR))) return results;

  // Two-level walk: sessions/<encoded-cwd>/<file>.jsonl
  const cwdDirs = await readdir(PI_SESSIONS_DIR, { withFileTypes: true });

  for (const dirent of cwdDirs) {
    if (!dirent.isDirectory()) continue;
    const dirPath = join(PI_SESSIONS_DIR, dirent.name);

    const files = await readdir(dirPath, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const filePath = join(dirPath, f.name);
      const id = basename(f.name, '.jsonl');

      try {
        const info = await readSessionInfo(filePath, id);
        results.push({ ...info, cwd: dirent.name });
      } catch {
        // Skip unreadable files.
      }
    }
  }

  return results;
}

/** Whether a path exists. Local helper — avoids importing fs/promises exists. */
async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Sort sessions by most-recent first. */
export function sortByRecent(sessions: SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((a, b) => {
    const ta = a.lastUsedAt ?? '';
    const tb = b.lastUsedAt ?? '';
    return tb.localeCompare(ta);
  });
}
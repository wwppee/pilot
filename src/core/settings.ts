/**
 * Settings reader for `~/.pi/agent/settings.json`.
 *
 * Pilot never writes to settings.json — we only read it (writing is pi's job).
 * If the file is missing or malformed, return null instead of throwing,
 * so commands can degrade gracefully.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PI_SETTINGS_FILE, type PiSettings } from './types.js';

/**
 * Read and parse the global pi settings file.
 *
 * @returns The parsed settings, or null if the file is missing / malformed.
 */
export async function readSettings(): Promise<PiSettings | null> {
  if (!existsSync(PI_SETTINGS_FILE)) {
    return null;
  }

  try {
    const raw = await readFile(PI_SETTINGS_FILE, 'utf-8');
    return JSON.parse(raw) as PiSettings;
  } catch (err) {
    // Malformed JSON — return null so callers can handle it.
    // We intentionally swallow the error here; commands will surface it.
    return null;
  }
}

/** Return the list of installed sources, or [] if settings is missing. */
export function listSources(settings: PiSettings | null): PiSettings['sources'] {
  if (!settings || !Array.isArray(settings.sources)) return [];
  return settings.sources;
}
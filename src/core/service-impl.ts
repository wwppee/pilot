/**
 * Default implementation of PilotService.
 *
 * Wires together the existing core modules (settings, jsonl-parser, npm-registry,
 * pi-cli, capability) into a single object that satisfies the PilotService interface.
 *
 * This is the **only** place where read paths converge. Commands / server / Web UI
 * must all go through this. The default impl is intentionally not exported
 * directly — callers receive it via `createService()` so tests can swap in
 * a mock.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

import { listCapabilities, tryLoadCapability } from './capability.js';
import { readSessionTree, searchSession } from './jsonl-parser.js';
import {
  classifyFromManifest,
  readPackManifestCached,
} from './pack-manifest.js';
import { getPack, searchPacks as searchPacksNpm } from './npm-registry.js';
import { isPiInstalled, runPiStreaming } from './pi-cli.js';
import {
  deleteProfile,
  listProfiles,
  tryReadProfile,
  writeProfile,
} from './profile.js';
import { listAllSessions, sortByRecent } from './sessions.js';
import { listSources, readSettings } from './settings.js';
import {
  piAgentDir,
  piSettingsFile,
  piSessionsDir,
  type InstalledPack,
  type Pack,
  type SessionInfo,
  type SessionTree,
} from './types.js';

import type {
  DoctorCheck,
  DoctorReport,
  PilotService,
  SessionFilter,
  SessionSearchHit,
} from './service.js';

export interface CreateServiceOptions {
  /**
   * Override the user's home directory. Defaults to `$HOME` (or `os.homedir()`).
   * Tests use this to point service at a temp dir.
   */
  home?: string;
}

// ─── Factory ───────────────────────────────────────────────

/** Create the default service instance. */
export function createService(opts: CreateServiceOptions = {}): PilotService {
  const home = opts.home;
  return {
    listPacks: () => listPacks(home),
    searchPacks: (q) => searchPacks(q),
    getPack: (name) => getPack(name),
    installPack: (source) => installPack(source),

    listSessions: (filter) => listSessions(filter, home),
    searchSessions: (q, options) => searchSessions(q, options, home),
    readSessionTree: (id) => readSessionTreeById(id, home),

    runDoctor: () => runDoctor(home),

    listCapabilities: () => listCapabilities(home),
    getCapability: (id) => tryLoadCapability(id, home),

    listProfiles: () => listProfiles(home),
    getProfile: (name) => tryReadProfile(name, home),
    setProfile: (name, input) => writeProfile(name, input, home),
    deleteProfile: (name) => deleteProfile(name, home),
  };
}

// ─── Packs ─────────────────────────────────────────────────

async function listPacks(home?: string): Promise<InstalledPack[]> {
  const settings = await readSettings(home);
  const sources = listSources(settings);
  // Enrich each source with its manifest in parallel (cached). Falls back to
  // name heuristic when manifest is missing or has no `pi` field.
  return Promise.all(sources.map((s) => toInstalledPack(s)));
}

async function searchPacks(query: string): Promise<Pack[]> {
  return searchPacksNpm({ query, size: 15 });
}

async function installPack(source: string): Promise<void> {
  const spec = source.includes(':') ? source : `npm:${source}`;
  await runPiStreaming(['install', spec]);
}

async function toInstalledPack(
  src: NonNullable<ReturnType<typeof listSources>>[number],
): Promise<InstalledPack> {
  const raw = src.source;
  const colonIdx = raw.indexOf(':');
  const name = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
  // Read manifest (cached). Falls back to name heuristic on failure or
  // when manifest has no `pi` field.
  const manifest = await readPackManifestCached(name);
  return {
    source: raw,
    name,
    enabled: src.enabled !== false,
    kind: classifyFromManifest(manifest, name),
  };
}

// ─── Sessions ──────────────────────────────────────────────

async function listSessions(
  filter: SessionFilter | undefined,
  home?: string,
): Promise<SessionInfo[]> {
  const all = sortByRecent(await listAllSessions(home));
  if (!filter) return all;

  return all.filter((s) => {
    if (filter.model && !(s.model ?? '').toLowerCase().includes(filter.model.toLowerCase())) {
      return false;
    }
    if (filter.cwd && s.cwd !== filter.cwd) return false;
    if (filter.sinceDays !== undefined) {
      const lastUsed = s.lastUsedAt ? Date.parse(s.lastUsedAt) : 0;
      const cutoff = Date.now() - filter.sinceDays * 24 * 60 * 60 * 1000;
      if (lastUsed < cutoff) return false;
    }
    return true;
  });
}

async function searchSessions(
  query: string,
  options: { caseSensitive?: boolean } | undefined,
  home?: string,
): Promise<SessionSearchHit[]> {
  const caseSensitive = options?.caseSensitive ?? false;
  const all = await listAllSessions(home);

  // Bounded concurrency — don't pin the disk on huge session stores.
  const CONCURRENCY = 8;
  const queue: SessionInfo[] = [...all];
  const hits: SessionSearchHit[] = [];

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const info = queue.shift();
        if (!info) return;
        try {
          const count = await searchSession(info.path, query, caseSensitive);
          if (count > 0) hits.push({ info, hits: count });
        } catch {
          // skip unreadable
        }
      }
    }),
  );

  hits.sort((a, b) => b.hits - a.hits);
  return hits;
}

async function readSessionTreeById(id: string, home?: string): Promise<SessionTree> {
  const all = await listAllSessions(home);
  const match = all.find((s) => s.id === id);
  if (!match) {
    throw new Error(`session not found: ${id}`);
  }
  return readSessionTree(match.path, id);
}

// ─── Doctor ────────────────────────────────────────────────

async function runDoctor(home?: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // Node version
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    ok: nodeMajor >= 20,
    message: `Node ${process.versions.node}`,
    ...(nodeMajor < 20 ? { hint: 'Upgrade to Node 20+' } : {}),
  });

  // pi on PATH
  const piOk = await isPiInstalled();
  checks.push({
    ok: piOk,
    message: piOk ? 'pi on PATH' : 'pi NOT found',
    ...(piOk ? {} : { hint: 'Install: npm install -g @earendil-works/pi-coding-agent' }),
  });

  // fd (optional)
  let fdOk = false;
  try {
    // We only care whether the binary exists; ignore its output.
    await execFileAsync('fd', ['--version'], { stdio: 'ignore' } as never);
    fdOk = true;
  } catch {
    fdOk = false;
  }
  checks.push({
    ok: fdOk,
    message: fdOk ? 'fd installed (recommended)' : 'fd not found',
    ...(fdOk ? {} : { hint: 'Optional: brew install fd — speeds up file search' }),
  });

  // ~/.pi/agent exists
  const dirOk = await pathExists(piAgentDir(home));
  checks.push({
    ok: dirOk,
    message: dirOk ? '~/.pi/agent exists' : '~/.pi/agent missing',
    ...(dirOk ? {} : { hint: 'Run `pi` once to initialize the directory' }),
  });

  // settings.json
  const settings = await readSettings(home);
  const settingsExists = await pathExists(piSettingsFile(home));
  if (settingsExists) {
    checks.push({
      ok: settings !== null,
      message: settings !== null ? 'settings.json valid' : 'settings.json malformed',
      ...(settings !== null
        ? {}
        : { hint: 'Run `pilot doctor` to see parse details' }),
    });
  } else {
    checks.push({ ok: true, message: 'settings.json not yet created' });
  }

  // Pack conflicts
  const sources = listSources(settings);
  if (sources.length >= 2) {
    const subagent = sources.filter((s) => /subagent|crew|orchestr/i.test(s.source));
    if (subagent.length >= 2) {
      checks.push({
        ok: false,
        message: `${subagent.length} subagent packs installed (likely conflict)`,
        hint: 'Keep only one: pilot pack uninstall <others>',
      });
    }
  }

  // Sessions dir size
  const sessionsDir = piSessionsDir(home);
  if (await pathExists(sessionsDir)) {
    const total = await dirSize(sessionsDir);
    const mb = total / (1024 * 1024);
    checks.push({
      ok: mb < 500,
      message: `sessions: ${mb.toFixed(1)} MB total`,
      ...(mb >= 500
        ? { hint: 'Consider: pilot session gc --older-than 30d (v0.2)' }
        : {}),
    });
  }

  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0, failed, checks };
}

/** Recursive size of a directory in bytes. Bounded by depth for safety. */
async function dirSize(p: string, depth = 0): Promise<number> {
  if (depth > 6) return 0;
  let entries;
  try {
    entries = await readdir(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const e of entries) {
    const full = join(p, e.name);
    if (e.isDirectory()) {
      total += await dirSize(full, depth + 1);
    } else if (e.isFile()) {
      try {
        const s = await stat(full);
        total += s.size;
      } catch {
        // skip
      }
    }
  }
  return total;
}

/**
 * Check if a path exists. Resolves true/false; never throws.
 * Replaces existsSync (which is sync and not promisified).
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

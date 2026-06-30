/**
 * `pilot session` — manage pi session files.
 *
 * Subcommands (v0.1):
 *   ls      List all sessions, most recent first
 *   search  Full-text search across all session entries
 *
 * v0.2: diff, tree, export, share, gc, stats.
 *
 * All read/write paths go through `ctx.service` — no direct core imports.
 */

import kleur from 'kleur';
import type { PilotContext, Command, SessionInfo } from '../core/types.js';

export const manifest: Command = {
  name: 'session',
  description: 'Manage pi session files',
  subcommands: ['ls', 'search <query>'],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];

  switch (sub) {
    case 'ls':
      return ls(ctx);
    case 'search':
      return search(args.slice(1), ctx);
    case 'diff':
    case 'tree':
    case 'export':
      ctx.logger.warn(`\`pilot session ${sub}\` is in v0.2`);
      return 0;
    case undefined:
      ctx.logger.error('Missing subcommand. Try: pilot session ls|search');
      return 1;
    default:
      ctx.logger.error(`Unknown subcommand: ${sub}`);
      return 1;
  }
}

// ─── ls ────────────────────────────────────────────────────────────

async function ls(ctx: PilotContext): Promise<number> {
  const sorted = await ctx.service.listSessions();

  if (sorted.length === 0) {
    ctx.logger.info('No sessions found.');
    return 0;
  }

  ctx.logger.info(`${sorted.length} session(s):\n`);

  // Group by encoded cwd
  const byCwd = new Map<string, SessionInfo[]>();
  for (const s of sorted) {
    const key = s.cwd ?? '<unknown>';
    const arr = byCwd.get(key) ?? [];
    arr.push(s);
    byCwd.set(key, arr);
  }

  for (const [cwd, items] of byCwd) {
    console.log(kleur.bold().underline(decodeCwd(cwd)));
    for (const s of items.slice(0, 10)) {
      const date = (s.lastUsedAt ?? '').slice(0, 16).replace('T', ' ');
      const model = s.model ? kleur.dim(` · ${s.model}`) : '';
      const size = formatBytes(s.sizeBytes);
      console.log(`  ${kleur.cyan(date)}  ${s.entries} entries · ${size}${model}`);
      console.log(`    ${kleur.dim(s.path)}`);
    }
    if (items.length > 10) {
      console.log(kleur.dim(`  ... and ${items.length - 10} more in this dir`));
    }
    console.log();
  }

  return 0;
}

// ─── search ────────────────────────────────────────────────────────

async function search(args: string[], ctx: PilotContext): Promise<number> {
  const query = args[0];
  if (!query) {
    ctx.logger.error('Usage: pilot session search "<query>"');
    return 1;
  }
  const caseSensitive = args.includes('--case');

  ctx.logger.info(`Searching all sessions for: ${kleur.cyan(query)}\n`);

  const hits = await ctx.service.searchSessions(query, { caseSensitive });

  if (hits.length === 0) {
    ctx.logger.info('No matches.');
    return 0;
  }

  console.log(kleur.dim(`${hits.length} session(s) contain matches.\n`));

  for (const { info, hits: count } of hits) {
    const date = (info.lastUsedAt ?? '').slice(0, 16).replace('T', ' ');
    const marker = kleur.yellow('★');
    console.log(`  ${marker} ${kleur.cyan(date)}  ${kleur.bold(String(count))} hits`);
    console.log(`    ${kleur.dim(decodeCwd(info.cwd ?? '<unknown>'))}`);
    console.log(`    ${kleur.dim(info.path)}`);
    console.log();
  }

  console.log(kleur.dim(`Re-open with: pi --resume ${hits[0]?.info.id}`));
  return 0;
}

// ─── helpers ───────────────────────────────────────────────────────

/**
 * Best-effort decode of pi's base64-encoded cwd dir name.
 * Pi uses base64url encoding of the absolute cwd path.
 *
 * If decode fails (it's not always base64 — older versions used other schemes),
 * fall back to showing the raw key.
 */
function decodeCwd(encoded: string): string {
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    // sanity check: should look like a path
    if (decoded.startsWith('/') || /^[A-Z]:/.test(decoded)) return decoded;
  } catch {
    // ignore
  }
  return `<encoded:${encoded.slice(0, 12)}…>`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
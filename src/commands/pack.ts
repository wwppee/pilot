/**
 * `pilot pack` — manage pi packages and meta-packs.
 *
 * Subcommands (v0.1):
 *   ls        List installed packs, grouped by kind
 *   search    Search npm registry from the terminal
 *   info      Show details for a pack
 *   install   Install a pack (shells out to `pi install`)
 */

import kleur from 'kleur';
import { readSettings, listSources } from '../core/settings.js';
import { searchPacks, getPack } from '../core/npm-registry.js';
import { runPi } from '../core/pi-cli.js';
import type { InstalledPack, PackKind, PilotContext, Command } from '../core/types.js';

export const manifest: Command = {
  name: 'pack',
  description: 'Manage pi packages and meta-packs',
  subcommands: ['ls', 'search <query>', 'info <pkg>', 'install <pkg>'],
};

/** Dispatch `pilot pack <subcommand>` to the right function. */
export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];

  switch (sub) {
    case 'ls':
      return ls(ctx);
    case 'search':
      return search((args[1] ?? '').trim(), ctx);
    case 'info':
      return info(args[1] ?? '', ctx);
    case 'install':
      return install(args[1] ?? '', ctx);
    case 'team':
      ctx.logger.warn('`pilot pack team` is in v0.2 — track in #15');
      return 0;
    case undefined:
      ctx.logger.error('Missing subcommand. Try: pilot pack ls|search|info|install');
      return 1;
    default:
      ctx.logger.error(`Unknown subcommand: ${sub}`);
      return 1;
  }
}

// ─── ls ─────────────────────────────────────────────────────────────

async function ls(ctx: PilotContext): Promise<number> {
  const settings = await readSettings();
  const sources = listSources(settings);

  if (sources.length === 0) {
    ctx.logger.info('No packs installed. Try: pilot pack search subagent');
    return 0;
  }

  const packs = sources.map(toInstalledPack);

  ctx.logger.info(`${packs.length} pack(s) installed:\n`);

  const grouped = groupByKind(packs);
  for (const [kind, items] of grouped) {
    console.log(kleur.bold().underline(labelForKind(kind)));
    for (const p of items) {
      const mark = p.enabled ? kleur.green('●') : kleur.gray('○');
      const src = kleur.cyan(p.source);
      console.log(`  ${mark} ${src}`);
    }
    console.log();
  }

  // Heuristic conflict detection: warn if 3+ subagent packs installed.
  const subagentCount = packs.filter(isSubagentPack).length;
  if (subagentCount >= 2) {
    ctx.logger.warn(
      `${subagentCount} subagent packs detected — they may conflict. Keep only one.`,
    );
  }

  return 0;
}

// ─── search ────────────────────────────────────────────────────────

async function search(query: string, ctx: PilotContext): Promise<number> {
  if (!query) {
    ctx.logger.error('Usage: pilot pack search <query>');
    return 1;
  }

  try {
    const results = await searchPacks({ query, size: 15 });
    if (results.length === 0) {
      ctx.logger.info('No matches.');
      return 0;
    }

    console.log(kleur.dim(`Showing ${results.length} of many. Install with: pilot pack install <name>\n`));

    for (const p of results) {
      const name = kleur.cyan().bold(p.name);
      const ver = kleur.dim(`@${p.version}`);
      const desc = p.description.length > 60
        ? p.description.slice(0, 57) + '...'
        : p.description;
      console.log(`  ${name}${ver}`);
      console.log(`    ${desc}`);
    }
    return 0;
  } catch (err) {
    ctx.logger.error(`Search failed: ${(err as Error).message}`);
    return 1;
  }
}

// ─── info ──────────────────────────────────────────────────────────

async function info(name: string, ctx: PilotContext): Promise<number> {
  if (!name) {
    ctx.logger.error('Usage: pilot pack info <pkg>');
    return 1;
  }

  try {
    const pack = await getPack(name);
    if (!pack) {
      ctx.logger.error(`Package not found: ${name}`);
      return 1;
    }

    console.log(kleur.cyan().bold(pack.name) + kleur.dim(` @ ${pack.version}`));
    console.log();
    if (pack.description) console.log(`  ${pack.description}`);
    if (pack.author) console.log(kleur.dim(`  author: ${pack.author}`));
    if (pack.lastPublished) console.log(kleur.dim(`  last published: ${pack.lastPublished.slice(0, 10)}`));
    if (pack.keywords && pack.keywords.length > 0) {
      console.log(kleur.dim(`  keywords: ${pack.keywords.join(', ')}`));
    }
    console.log();
    console.log(kleur.dim(`  Install: pilot pack install ${pack.name}`));

    return 0;
  } catch (err) {
    ctx.logger.error(`Failed: ${(err as Error).message}`);
    return 1;
  }
}

// ─── install ───────────────────────────────────────────────────────

async function install(source: string, ctx: PilotContext): Promise<number> {
  if (!source) {
    ctx.logger.error('Usage: pilot pack install <pkg>     (e.g. npm:pi-subagents or @scope/pkg)');
    return 1;
  }

  // If user passed bare package name without scheme, default to npm:
  const spec = source.includes(':') ? source : `npm:${source}`;

  ctx.logger.info(`Running: pi install ${spec}`);
  const res = await runPi({ args: ['install', spec], tolerateFailure: true });

  if (res.stdout.trim()) process.stdout.write(res.stdout);
  if (res.stderr.trim()) process.stderr.write(res.stderr);

  if (res.exitCode !== 0) {
    ctx.logger.error(`Install failed (exit ${res.exitCode})`);
    return res.exitCode;
  }

  ctx.logger.success('Installed.');
  return 0;
}

// ─── helpers ───────────────────────────────────────────────────────

function toInstalledPack(src: NonNullable<ReturnType<typeof listSources>>[number]): InstalledPack {
  const raw = src.source;
  // Source spec: "npm:@scope/pkg" or "git:..." or local path
  const colonIdx = raw.indexOf(':');
  const name = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
  return {
    source: raw,
    name,
    enabled: src.enabled !== false,
    kind: classifyKind(name),
  };
}

const SUBAGENT_HINTS = ['subagent', 'sub-agent', 'agent', 'crew', 'orchestr'];
const SKILL_HINTS = ['-skill', 'skill-', 'superpowers', 'memory'];
const THEME_HINTS = ['-theme', 'theme-', 'footer', 'hud'];
const PROMPT_HINTS = ['-prompt', 'prompt-'];

function classifyKind(name: string): PackKind {
  const lower = name.toLowerCase();
  if (SKILL_HINTS.some((h) => lower.includes(h))) return 'skill';
  if (THEME_HINTS.some((h) => lower.includes(h))) return 'theme';
  if (PROMPT_HINTS.some((h) => lower.includes(h))) return 'prompt';
  if (lower.endsWith('-prompt') || lower.endsWith('-theme')) return 'prompt';
  return 'extension';
}

function isSubagentPack(p: InstalledPack): boolean {
  const lower = p.name.toLowerCase();
  return SUBAGENT_HINTS.some((h) => lower.includes(h));
}

function labelForKind(kind: PackKind): string {
  return ({
    extension: '🔌 Extensions',
    skill: '📚 Skills',
    theme: '🎨 Themes',
    prompt: '💬 Prompts',
    unknown: '❓ Unknown',
  } as const)[kind];
}

function groupByKind(packs: InstalledPack[]): Map<PackKind, InstalledPack[]> {
  const m = new Map<PackKind, InstalledPack[]>();
  for (const p of packs) {
    const arr = m.get(p.kind) ?? [];
    arr.push(p);
    m.set(p.kind, arr);
  }
  // Stable display order
  const order: PackKind[] = ['extension', 'skill', 'theme', 'prompt', 'unknown'];
  return new Map(order.filter((k) => m.has(k)).map((k) => [k, m.get(k) ?? []]));
}
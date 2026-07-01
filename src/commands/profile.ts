/**
 * `pilot profile` — manage named Pilot profiles.
 *
 * Subcommands (v0.3.0-b):
 *   ls        List all profiles
 *   show      Show details for a profile
 *   create    Create a new profile
 *   set       Update a profile field
 *   delete    Delete a profile
 *
 * Profile storage: `~/.pilot/profiles/<name>.toml`. Pilot never writes
 * to `~/.pi/agent/settings.json` directly.
 *
 * Future (v0.3.0+): `pilot profile use <name>` to apply overlay when
 * launching pi. `pilot profile share` to export a team-style TOML.
 */

import kleur from 'kleur';
import { ensureProfilesDir } from '../core/profile.js';
import type { ProfileInput, ThinkingLevel } from '../core/profile.js';
import type { PilotContext, Command } from '../core/types.js';

export const manifest: Command = {
  name: 'profile',
  description: 'Manage named Pilot profiles',
  subcommands: ['ls', 'show <name>', 'create <name>', 'set <name> <key>=<val>', 'delete <name>'],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const sub = args[0];

  switch (sub) {
    case 'ls':
      return ls(ctx);
    case 'show':
      return show(args[1] ?? '', ctx);
    case 'create':
      return create(args[1] ?? '', ctx);
    case 'set':
      return set(args[1] ?? '', args[2] ?? '', ctx);
    case 'delete':
      return del(args[1] ?? '', ctx);
    case 'use':
    case 'share':
      ctx.logger.warn(`\`pilot profile ${sub}\` ships in a follow-up release`);
      return 0;
    case undefined:
      ctx.logger.error('Missing subcommand. Try: pilot profile ls|show|create|set|delete');
      return 1;
    default:
      ctx.logger.error(`Unknown subcommand: ${sub}`);
      return 1;
  }
}

// ─── ls ────────────────────────────────────────────────────────────

async function ls(ctx: PilotContext): Promise<number> {
  const profiles = await ctx.service.listProfiles();
  if (profiles.length === 0) {
    ctx.logger.info('No profiles. Create one with: pilot profile create <name>');
    return 0;
  }

  ctx.logger.info(`${profiles.length} profile(s):\n`);
  for (const p of profiles) {
    const mark = kleur.cyan('●');
    const model = p.model ? kleur.dim(` model=${p.model}`) : '';
    const thinking = p.thinking ? kleur.dim(` thinking=${p.thinking}`) : '';
    const team = p.team ? kleur.dim(` team=${p.team}`) : '';
    console.log(`  ${mark} ${kleur.bold(p.name)}${model}${thinking}${team}`);
    if (p.description) console.log(kleur.dim(`    ${p.description}`));
  }
  return 0;
}

// ─── show ──────────────────────────────────────────────────────────

async function show(name: string, ctx: PilotContext): Promise<number> {
  if (!name) {
    ctx.logger.error('Usage: pilot profile show <name>');
    return 1;
  }
  const profile = await ctx.service.getProfile(name);
  if (!profile) {
    ctx.logger.error(`Profile not found: ${name}`);
    return 1;
  }

  console.log(kleur.cyan().bold(profile.name));
  if (profile.description) console.log(`  ${profile.description}`);
  console.log();
  if (profile.model) console.log(`  model:     ${profile.model}`);
  if (profile.thinking) console.log(`  thinking:  ${profile.thinking}`);
  if (profile.team) console.log(`  team:      ${profile.team}`);
  console.log(kleur.dim(`  created:   ${profile.createdAt}`));
  console.log(kleur.dim(`  updated:   ${profile.updatedAt}`));
  return 0;
}

// ─── create ───────────────────────────────────────────────────────

async function create(name: string, ctx: PilotContext): Promise<number> {
  if (!name) {
    ctx.logger.error('Usage: pilot profile create <name>');
    return 1;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    ctx.logger.error('Profile name must be kebab-case (a-z, 0-9, single dashes)');
    return 1;
  }

  await ensureProfilesDir(ctx.home || undefined);

  try {
    const profile = await ctx.service.setProfile(name, {});
    ctx.logger.success(`Created profile: ${kleur.cyan(profile.name)}`);
    return 0;
  } catch (err) {
    ctx.logger.error(`Failed: ${(err as Error).message}`);
    return 1;
  }
}

// ─── set ──────────────────────────────────────────────────────────

async function set(name: string, expr: string, ctx: PilotContext): Promise<number> {
  if (!name) {
    ctx.logger.error('Usage: pilot profile set <name> <key>=<value>');
    return 1;
  }
  if (!expr.includes('=')) {
    ctx.logger.error('Expected <key>=<value>');
    return 1;
  }
  const eqIdx = expr.indexOf('=');
  const key = expr.slice(0, eqIdx).trim();
  const value = expr.slice(eqIdx + 1).trim();
  if (!key) {
    ctx.logger.error('Empty key');
    return 1;
  }

  const existing = await ctx.service.getProfile(name);
  if (!existing) {
    ctx.logger.error(`Profile not found: ${name}`);
    return 1;
  }

  const input = profileInputFromSet(existing, key, value);
  if (!input) {
    ctx.logger.error(`Unknown or invalid key: ${key}`);
    return 1;
  }

  try {
    const profile = await ctx.service.setProfile(name, input);
    ctx.logger.success(`Updated ${kleur.cyan(profile.name)}: ${key}=${value}`);
    return 0;
  } catch (err) {
    ctx.logger.error(`Failed: ${(err as Error).message}`);
    return 1;
  }
}

/** Convert a single `key=value` update into a ProfileInput (merging over existing). */
function profileInputFromSet(
  existing: {
    model?: string | undefined;
    thinking?: ThinkingLevel | undefined;
    team?: string | undefined;
    description?: string | undefined;
  },
  key: string,
  value: string,
): ProfileInput | null {
  // Only carry over ProfileInput fields (omits name/createdAt/updatedAt).
  const base: ProfileInput = {};
  if (existing.model !== undefined) base.model = existing.model;
  if (existing.thinking !== undefined) base.thinking = existing.thinking;
  if (existing.team !== undefined) base.team = existing.team;
  if (existing.description !== undefined) base.description = existing.description;

  switch (key) {
    case 'model':
      return { ...base, model: value };
    case 'thinking': {
      if (!['off', 'low', 'medium', 'high', 'xhigh'].includes(value)) return null;
      return { ...base, thinking: value as ThinkingLevel };
    }
    case 'team':
      return { ...base, team: value };
    case 'description':
      return { ...base, description: value };
    default:
      return null;
  }
}

// ─── delete ───────────────────────────────────────────────────────

async function del(name: string, ctx: PilotContext): Promise<number> {
  if (!name) {
    ctx.logger.error('Usage: pilot profile delete <name>');
    return 1;
  }
  const deleted = await ctx.service.deleteProfile(name);
  if (!deleted) {
    ctx.logger.error(`Profile not found: ${name}`);
    return 1;
  }
  ctx.logger.success(`Deleted profile: ${kleur.cyan(name)}`);
  return 0;
}
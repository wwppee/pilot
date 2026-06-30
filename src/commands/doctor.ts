/**
 * `pilot doctor` — health checks for your pi setup.
 *
 * v0.1 checks:
 *   - pi binary on PATH
 *   - Node version >= 20
 *   - fd (optional, recommended)
 *   - settings.json exists & parses
 *   - installed packs have no obvious conflicts
 *   - session dir size (warns if huge)
 */

import kleur from 'kleur';
import { existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { isPiInstalled } from '../core/pi-cli.js';
import { readSettings, listSources } from '../core/settings.js';
import { piAgentDir, piSettingsFile, piSessionsDir } from '../core/types.js';
import type { PilotContext, Command } from '../core/types.js';

export const manifest: Command = {
  name: 'doctor',
  description: 'Health checks for your pi setup',
};

interface Check {
  ok: boolean;
  message: string;
  hint?: string;
}

export async function run(args: string[], _ctx: PilotContext): Promise<number> {
  if (args[0] === '--json') {
    return json();
  }

  console.log(kleur.bold().underline('Pilot Doctor'));
  console.log(kleur.dim('Health check for your pi setup\n'));

  const checks: Check[] = [];

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
    execSync('fd --version', { stdio: 'ignore' });
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
  const dirOk = existsSync(piAgentDir());
  checks.push({
    ok: dirOk,
    message: dirOk ? '~/.pi/agent exists' : '~/.pi/agent missing',
    ...(dirOk ? {} : { hint: 'Run `pi` once to initialize the directory' }),
  });

  // settings.json
  const settings = await readSettings();
  if (existsSync(piSettingsFile())) {
    checks.push({
      ok: settings !== null,
      message: settings !== null ? 'settings.json valid' : 'settings.json malformed',
      ...(settings !== null
        ? {}
        : { hint: 'Run `pilot doctor --json` for parse details' }),
    });
  } else {
    checks.push({
      ok: true,
      message: 'settings.json not yet created',
    });
  }

  // Pack conflicts (only meaningful if settings loaded)
  const sources = listSources(settings);
  if (sources.length >= 2) {
    const subagent = sources.filter((s) =>
      /subagent|crew|orchestr/i.test(s.source),
    );
    if (subagent.length >= 2) {
      checks.push({
        ok: false,
        message: `${subagent.length} subagent packs installed (likely conflict)`,
        hint: 'Keep only one: pilot pack uninstall <others>',
      });
    }
  }

  // Sessions dir size
  if (existsSync(piSessionsDir())) {
    const total = await dirSize(piSessionsDir());
    const mb = total / (1024 * 1024);
    checks.push({
      ok: mb < 500,
      message: `sessions: ${mb.toFixed(1)} MB total`,
      ...(mb >= 500 ? { hint: 'Consider: pilot session gc --older-than 30d (v0.2)' } : {}),
    });
  }

  // Render
  let failed = 0;
  for (const c of checks) {
    const icon = c.ok ? kleur.green('✓') : kleur.red('✗');
    console.log(`  ${icon} ${c.message}`);
    if (!c.ok && c.hint) {
      console.log(kleur.dim(`    → ${c.hint}`));
    }
    if (!c.ok) failed++;
  }

  console.log();
  if (failed === 0) {
    console.log(kleur.green('All checks passed.'));
    return 0;
  }
  console.log(kleur.yellow(`${failed} issue(s) found.`));
  return failed > 0 ? 1 : 0;
}

async function json(): Promise<number> {
  const checks: Check[] = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ ok: nodeMajor >= 20, message: `node ${process.versions.node}` });
  checks.push({ ok: await isPiInstalled(), message: 'pi on PATH' });
  try {
    execSync('fd --version', { stdio: 'ignore' });
    checks.push({ ok: true, message: 'fd installed' });
  } catch {
    checks.push({ ok: false, message: 'fd not installed' });
  }
  const settings = await readSettings();
  checks.push({
    ok: settings !== null || !existsSync(piSettingsFile()),
    message: existsSync(piSettingsFile())
      ? settings !== null ? 'settings.json valid' : 'settings.json malformed'
      : 'settings.json missing',
  });

  console.log(JSON.stringify({ checks }, null, 2));
  return 0;
}

/** Recursive size of a directory in bytes. Bounded by depth for safety. */
async function dirSize(p: string, depth = 0): Promise<number> {
  if (depth > 6) return 0;
  let total = 0;
  let entries;
  try {
    entries = await readdir(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = join(p, e.name);
    if (e.isDirectory()) {
      total += await dirSize(full, depth + 1);
    } else if (e.isFile()) {
      try {
        total += statSync(full).size;
      } catch {
        // skip
      }
    }
  }
  return total;
}
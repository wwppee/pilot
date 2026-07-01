/**
 * `pilot dashboard` — open the local Web UI.
 *
 * v0.3.5: read-only Next.js dashboard at http://127.0.0.1:17371.
 * The UI talks to the pilot server (17361) over token-authenticated
 * fetch, so the token never reaches the browser.
 *
 * Lifecycle:
 *   1. Find the web/ dir (sibling to this package)
 *   2. Ensure `npm install` has run there (look for .next/ or
 *      node_modules/ — install if missing)
 *   3. Spawn `next dev` (or `next start` after build) on a fixed
 *      port
 *   4. Open the browser unless --no-open
 *
 * For v1 we always run dev mode — fast feedback, no build cost.
 * Production builds are a follow-up.
 */

import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import kleur from 'kleur';
import type { Command, PilotContext } from '../core/types.js';

const execFileP = promisify(execFile);

const WEB_PORT = 17371;
const PILOT_PORT = 17361;

export const manifest: Command = {
  name: 'dashboard',
  description: 'Open the local Web UI in your browser',
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const noOpen = args.includes('--no-open');
  const devOnly = args.includes('--dev');

  // Locate the web/ dir (sibling of this CLI package).
  const here = dirname(fileURLToPath(import.meta.url));
  // src/cli lives at <pkg>/src/cli.ts OR <pkg>/dist/cli.js. Both work
  // — we walk up two levels and look for `web/`.
  const webDir = resolve(here, '..', '..', 'web');

  if (!existsSync(webDir)) {
    ctx.logger.error(`web/ not found at ${webDir}. Did you clone with the subdir?`);
    return 1;
  }

  if (!existsSync(`${webDir}/node_modules`)) {
    ctx.logger.info('Installing web dependencies (first run)…');
    await execFileP('npm', ['install'], { cwd: webDir });
  }

  const url = `http://127.0.0.1:${WEB_PORT}`;
  ctx.logger.info(`Starting Pilot dashboard on ${kleur.cyan(url)}`);
  ctx.logger.info(`(pilot server must be running on 127.0.0.1:${PILOT_PORT})`);
  ctx.logger.info('Press Ctrl-C to stop.\n');

  if (!noOpen) {
    // Small delay so the server has a chance to start listening.
    setTimeout(() => openBrowser(url), 1500);
  }

  const args2 = devOnly ? ['run', 'dev'] : ['run', 'dev'];
  const proc = spawn('npm', args2, {
    cwd: webDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PILOT_SERVER_URL: `http://127.0.0.1:${PILOT_PORT}`,
    },
  });

  await new Promise<number>((resolveP) => {
    proc.on('exit', (code) => resolveP(code ?? 0));
    process.on('SIGINT', () => proc.kill('SIGINT'));
    process.on('SIGTERM', () => proc.kill('SIGTERM'));
  });

  return 0;
}

async function openBrowser(url: string): Promise<void> {
  const cmd = browserCommand(url);
  if (!cmd) return;
  try {
    spawn(cmd[0]!, cmd.slice(1), { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* ignore — user can paste the URL manually */
  }
}

/** Pick the right `open` invocation per OS. */
function browserCommand(url: string): string[] | null {
  switch (process.platform) {
    case 'darwin':
      return ['open', url];
    case 'win32':
      return ['cmd', '/c', 'start', url];
    case 'linux':
      return ['xdg-open', url];
    default:
      return null;
  }
}
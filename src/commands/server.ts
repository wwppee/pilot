/**
 * `pilot server` — start the local HTTP API.
 *
 *   pilot server                  # default: 127.0.0.1:17361
 *   pilot server --port 9000      # custom port
 *   pilot server --print-token    # print token + URL + exit (for Web UI auto-launch)
 *   pilot server --stop           # kill any running pilot server (best-effort)
 */

import kleur from 'kleur';
import { startServer } from '../server/server.js';
import type { Command, PilotContext } from '../core/types.js';

export const manifest: Command = {
  name: 'server',
  description: 'Start the local HTTP API (127.0.0.1:17361)',
  subcommands: [],
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const portIdx = args.indexOf('--port');
  const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 17361;
  if (Number.isNaN(port)) {
    ctx.logger.error('Invalid --port value');
    return 1;
  }

  const printToken = args.includes('--print-token');

  try {
    const serverOpts: { port: number; home?: string; logger: { level: string } } = {
      port,
      logger: { level: 'info' },
    };
    if (ctx.home) serverOpts.home = ctx.home;
    const handle = await startServer(serverOpts);

    if (printToken) {
      // Machine-readable for scripts / Web UI auto-launch
      console.log(JSON.stringify({ url: handle.url, token: handle.token }, null, 2));
    } else {
      ctx.logger.success(`Server listening at ${kleur.cyan().bold(handle.url)}`);
      console.log(kleur.dim(`  Token: ${handle.token}`));
      console.log(kleur.dim(`  Token file: ${ctx.home ? `${ctx.home}/.pilot/server.token` : '~/.pilot/server.token'}`));
      console.log();
      console.log(kleur.dim('Press Ctrl+C to stop.'));
    }

    // Block until SIGINT
    await new Promise<void>((resolve) => {
      const onSigint = async () => {
        process.off('SIGINT', onSigint);
        ctx.logger.dim('Shutting down...');
        await handle.close();
        resolve();
      };
      process.on('SIGINT', onSigint);
    });

    return 0;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'EADDRINUSE') {
      ctx.logger.error(`Port ${port} already in use. Try: pilot server --port ${port + 1}`);
      return 1;
    }
    ctx.logger.error(`Server failed: ${e.message ?? String(err)}`);
    return 1;
  }
}
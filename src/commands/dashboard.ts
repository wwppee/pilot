/**
 * `pilot dashboard` — open the local Web UI in your browser.
 *
 * v0.3.5+: read-only Next.js dashboard at http://127.0.0.1:17371.
 * v0.3.7+: this command now ALSO starts the pilot server (port 17361)
 *           in the same process, so one command brings up the whole
 *           stack. The token is read by the Web UI from
 *           `~/.pilot/server.token` server-side; the browser never sees it.
 * v0.4.6+: `--prod` runs `next build && next start` instead of `next dev`
 *           for a real production-mode web build (no Turbopack/HMR,
 *           no source maps, faster startup, suitable for sharing).
 *
 * Lifecycle:
 *   1. Find the web/ dir (sibling to this package)
 *   2. Ensure `npm install` has run there (look for node_modules/)
 *   3. Start the pilot server in-process on 127.0.0.1:17361
 *   4. Spawn `next dev` (default) or `next build && next start` (--prod)
 *      on 127.0.0.1:17371 with PILOT_SERVER_URL set
 *   5. Open the browser (unless --no-open)
 *
 * Both servers share this process so Ctrl-C cleans up everything.
 *
 * Flags:
 *   --no-open    Don't open the browser
 *   --no-server  Skip starting the pilot server (assume it's already running)
 *   --port N     Override web port (default 17371; pilot server fixed 17361)
 *   --prod       Production build: `next build && next start` (default: dev mode)
 *   --no-build   With --prod, skip the build step (use existing .next/)
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import kleur from "kleur";
import { startServer, type ServerHandle } from "../server/server.js";
import type { Command, PilotContext } from "../core/types.js";

const WEB_PORT = 17371;
const PILOT_PORT = 17361;

export const manifest: Command = {
  name: "dashboard",
  description:
    "Open the local Web UI in your browser (auto-starts the pilot server too)",
};

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const noOpen = args.includes("--no-open");
  const noServer = args.includes("--no-server");
  const prod = args.includes("--prod");
  const noBuild = args.includes("--no-build");

  // Optional port override: --port 17400 → next dev -p 17400
  const portIdx = args.indexOf("--port");
  const webPort = portIdx >= 0 ? Number(args[portIdx + 1]) : WEB_PORT;
  if (Number.isNaN(webPort)) {
    ctx.logger.error("Invalid --port value");
    return 1;
  }

  // Locate the web/ dir (sibling of this CLI package).
  const here = dirname(fileURLToPath(import.meta.url));
  const webDir = resolve(here, "..", "..", "web");

  if (!existsSync(webDir)) {
    ctx.logger.error(
      `web/ not found at ${webDir}. Did you clone with the subdir?`,
    );
    return 1;
  }

  if (!existsSync(`${webDir}/node_modules`)) {
    ctx.logger.info("Installing web dependencies (first run)…");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("npm", ["install"], { cwd: webDir });
  }

  // Step 1: start the pilot server in-process (unless --no-server).
  let serverHandle: ServerHandle | null = null;
  if (!noServer) {
    try {
      const opts: Parameters<typeof startServer>[0] = {
        port: PILOT_PORT,
        host: "127.0.0.1",
        logger: false, // stay quiet so web output is readable
      };
      if (ctx.home) opts.home = ctx.home;
      serverHandle = await startServer(opts);
      ctx.logger.success(
        `pilot server up on ${kleur.cyan(serverHandle.url)} (token: ${serverHandle.token.slice(0, 8)}…)`,
      );
    } catch (err) {
      ctx.logger.error(
        `Failed to start pilot server: ${(err as Error).message}`,
      );
      ctx.logger.error(
        `Try \`pilot server --stop\` first, or pass --no-server if it's already running.`,
      );
      return 1;
    }
  } else {
    ctx.logger.info(
      `Assuming pilot server is running on 127.0.0.1:${PILOT_PORT}`,
    );
  }

  // Step 2: build (prod only) then start next.
  const url = `http://127.0.0.1:${webPort}`;
  const mode = prod ? "production" : "dev";
  ctx.logger.info(
    `Starting Web UI in ${kleur.yellow(mode)} mode on ${kleur.cyan(url)}`,
  );
  ctx.logger.info("Press Ctrl-C to stop both servers.\n");

  // Pre-build for prod unless --no-build
  if (prod && !noBuild) {
    const buildMarker = `${webDir}/.next/BUILD_ID`;
    if (!existsSync(buildMarker)) {
      ctx.logger.info("Building web (first time)…");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      try {
        await promisify(execFile)("npm", ["run", "build"], {
          cwd: webDir,
        });
      } catch (err) {
        ctx.logger.error(`Web build failed: ${(err as Error).message}`);
        return 1;
      }
    } else {
      ctx.logger.dim("  (using existing .next/ build)");
    }
  }

  if (!noOpen) {
    setTimeout(() => openBrowser(url), 1500);
  }

  const script = prod ? "start" : "dev";
  const proc = spawn("npm", ["run", script], {
    cwd: webDir,
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: String(webPort),
      PILOT_SERVER_URL: `http://127.0.0.1:${PILOT_PORT}`,
    },
  });

  const cleanup = () => {
    proc.kill("SIGINT");
    if (serverHandle) {
      serverHandle.close().catch(() => undefined);
    }
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await new Promise<number>((resolveP) => {
    proc.on("exit", (code) => {
      if (serverHandle) {
        serverHandle.close().catch(() => undefined);
      }
      resolveP(code ?? 0);
    });
  });

  return 0;
}

async function openBrowser(url: string): Promise<void> {
  const cmd = browserCommand(url);
  if (!cmd) return;
  try {
    spawn(cmd[0]!, cmd.slice(1), { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* ignore — user can paste the URL manually */
  }
}

/** Pick the right `open` invocation per OS. */
function browserCommand(url: string): string[] | null {
  switch (process.platform) {
    case "darwin":
      return ["open", url];
    case "win32":
      return ["cmd", "/c", "start", url];
    case "linux":
      return ["xdg-open", url];
    default:
      return null;
  }
}

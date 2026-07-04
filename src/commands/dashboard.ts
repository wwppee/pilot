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
 * v0.5.0+: smart port-recovery — if 17361 / 17371 are already bound
 *           by a *previous Pilot instance* (recognised via cmdline
 *           fingerprint), kill it and continue instead of failing
 *           with EADDRINUSE. Foreign processes are left alone —
 *           the user gets a clear "port held by X (cmd Y)" message.
 * v0.5.0+: stale-build detection — in --prod mode, if any source
 *           file under web/src/ is newer than .next/BUILD_ID,
 *           rebuild before starting. Otherwise users who
 *           `git pull && pilot dashboard --prod` silently run
 *           yesterday's build.
 *
 * Lifecycle:
 *   1. Find the web/ dir (sibling to this package)
 *   2. Ensure `npm install` has run there (look for node_modules/)
 *   3. Free 17361 + 17371 if they're held by stale Pilot instances
 *   4. Start the pilot server in-process on 127.0.0.1:17361
 *   5. Spawn `next dev` (default) or `next build && next start` (--prod)
 *      on 127.0.0.1:17371 with PILOT_SERVER_URL set
 *   6. Open the browser (unless --no-open)
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
import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import kleur from "kleur";
import { startServer, type ServerHandle } from "../server/server.js";
import type { Command, PilotContext } from "../core/types.js";
import {
  isPortOpen,
  pidListeningOnPort,
  processCommandLine,
  looksLikePilotProcess,
  killProcessTree,
  waitForPortFree,
} from "../utils/net.js";

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

  // Step 1: free up both ports from stale Pilot instances, if any.
  // Foreign processes (not pilot) are left alone — we surface their
  // PID + cmdline so the user can deal with them manually.
  await ensurePortFree("127.0.0.1", PILOT_PORT, "pilot server", ctx);
  await ensurePortFree("127.0.0.1", webPort, "pilot dashboard", ctx);

  // Step 2: start the pilot server in-process (unless --no-server).
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

  // Step 3: build (prod only) then start next.
  const url = `http://127.0.0.1:${webPort}`;
  const mode = prod ? "production" : "dev";
  ctx.logger.info(
    `Starting Web UI in ${kleur.yellow(mode)} mode on ${kleur.cyan(url)}`,
  );
  ctx.logger.info("Press Ctrl-C to stop both servers.\n");

  // Pre-build for prod unless --no-build. v0.5.0: also rebuild when
  // the existing build is *stale* — any file in web/src/ or the web
  // package.json newer than .next/BUILD_ID triggers a rebuild.
  // Without this, `git pull && pilot dashboard --prod` would
  // silently serve yesterday's build.
  if (prod && !noBuild) {
    const buildMarker = `${webDir}/.next/BUILD_ID`;
    if (!existsSync(buildMarker)) {
      ctx.logger.info("Building web (first time)…");
    } else if (isWebBuildStale(webDir)) {
      ctx.logger.info("Web build is older than source — rebuilding…");
    } else {
      ctx.logger.dim("  (using existing .next/ build)");
    }

    if (!existsSync(buildMarker) || isWebBuildStale(webDir)) {
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

/**
 * Ensure `host:port` is free. If something's listening and looks like
 * a previous Pilot instance, kill it and wait for the port to free.
 * If it doesn't look like Pilot, surface the PID + cmdline and bail.
 *
 * `role` is a human label printed in messages ("pilot server" vs
 * "pilot dashboard") so users can tell which side is stuck.
 *
 * Returns true when the port is free (or was freed by killing a
 * Pilot process). Returns false when we couldn't free it — caller
 * should treat that as fatal and exit.
 */
async function ensurePortFree(
  host: string,
  port: number,
  role: string,
  ctx: PilotContext,
): Promise<boolean> {
  if (!(await isPortOpen(host, port))) return true;

  // Something's listening. Find out what.
  const pids = await pidListeningOnPort(port);
  if (pids.length === 0) {
    // Port shows as open but we can't determine the owner
    // (Windows, sandboxed macOS, no lsof/ss). Bail out and let the
    // user resolve it manually — better than guessing.
    ctx.logger.error(
      `Port ${port} is in use but the owner PID couldn't be determined.`,
    );
    ctx.logger.error(
      `Run \`lsof -nP -iTCP:${port} -sTCP:LISTEN\` to find and stop it, then retry.`,
    );
    return false;
  }

  // Inspect each candidate PID. If ANY of them is a Pilot instance,
  // we treat the conflict as recoverable. Otherwise the conflict is
  // foreign — bail out cleanly so we don't nuke someone's editor.
  const pilotPids: number[] = [];
  const foreignPids: number[] = [];
  for (const pid of pids) {
    const cmdline = await processCommandLine(pid);
    if (cmdline === null) {
      // Can't introspect — treat as foreign to be safe.
      foreignPids.push(pid);
      continue;
    }
    if (looksLikePilotProcess(cmdline)) {
      pilotPids.push(pid);
    } else {
      foreignPids.push(pid);
    }
  }

  if (foreignPids.length > 0 && pilotPids.length === 0) {
    ctx.logger.error(
      `Port ${port} is held by a foreign process (not Pilot). Refusing to kill it.`,
    );
    for (const pid of foreignPids) {
      const cmd = await processCommandLine(pid);
      ctx.logger.error(`  pid ${pid}: ${cmd ?? "(could not read cmdline)"}`);
    }
    ctx.logger.error(
      `Stop that process yourself, or pick a different port with --port.`,
    );
    return false;
  }

  if (pilotPids.length > 0) {
    ctx.logger.info(
      `Port ${port} is held by a previous ${role} instance — recovering…`,
    );
    for (const pid of pilotPids) {
      const cmd = await processCommandLine(pid);
      ctx.logger.dim(`    pid ${pid}: ${cmd ?? "?"}`);
      const killed = await killProcessTree(pid);
      if (!killed) {
        ctx.logger.error(
          `  failed to kill pid ${pid}. Try \`kill -9 ${pid}\` and retry.`,
        );
        return false;
      }
    }
  }

  // Wait for the port to actually free (TCP TIME_WAIT can take a beat).
  const freed = await waitForPortFree(host, port, 5_000);
  if (!freed) {
    ctx.logger.error(
      `Port ${port} still occupied after killing previous ${role}.`,
    );
    return false;
  }
  ctx.logger.dim(`  port ${port} is free.`);
  return true;
}

/**
 * True when .next/BUILD_ID is older than any source file under web/src/
 * or web/package.json — meaning a `git pull` changed web code but the
 * user is still pointing at yesterday's build.
 *
 * Walked with a single sync readdir per directory; cheap enough for the
 * <100-file web/src/ tree. Symlinks are skipped.
 */
function isWebBuildStale(webDir: string): boolean {
  const marker = join(webDir, ".next", "BUILD_ID");
  if (!existsSync(marker)) return true;
  let markerMtime: number;
  try {
    markerMtime = statSync(marker).mtimeMs;
  } catch {
    return true;
  }

  const roots = [join(webDir, "src"), join(webDir, "package.json")];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    if (statSync(root).mtimeMs > markerMtime) return true;
    if (statSync(root).isDirectory() && anyNewer(root, markerMtime)) {
      return true;
    }
  }
  return false;
}

function anyNewer(dir: string, cutoff: number): boolean {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    // Skip heavy dirs that don't affect the build.
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      if (anyNewer(p, cutoff)) return true;
    } else {
      try {
        if (statSync(p).mtimeMs > cutoff) return true;
      } catch {
        /* unreadable; skip */
      }
    }
  }
  return false;
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

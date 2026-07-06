/**
 * `pilot agent` — v0.5.4 Co-pilot entrypoint.
 *
 * Spawns Pi as a child process with the pilot-tools extension
 * auto-loaded, so the user can:
 *
 *   - Talk to Pi normally (interactive TUI)
 *   - Have Pi's LLM call Pilot commands mid-conversation
 *     (install packs, switch profiles, capture avatars, search
 *     sessions, run doctor, etc.)
 *
 * Flags:
 *   --cwd <path>     Run pi in the given directory
 *   --profile <name> Activate a Pilot profile before spawning pi
 *   --model <id>     Select a model pattern (passed to pi)
 *   --no-extension   Skip auto-install of pilot-tools extension
 *   --print-server   Print a "Pilot server at http://127.0.0.1:17361"
 *                    hint before launching pi (default true; suppress
 *                    with --no-print-server)
 *
 * The pilot-tools extension is installed (symlinked) on every launch:
 * idempotent — does nothing if it's already pointing at our source.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import kleur from "kleur";
import { isPiInstalled } from "../core/pi-cli.js";
import type { Command, PilotContext } from "../core/types.js";
import { isPortOpen } from "../utils/net.js";
import {
  installPilotTools,
  resolveInstallDir,
} from "../core/extension-installer.js";

export const manifest: Command = {
  name: "agent",
  description:
    "Launch Pi with Pilot's tools loaded (Co-pilot mode). Pi's LLM can call pilot commands mid-conversation.",
};

interface AgentOptions {
  cwd?: string;
  profile?: string;
  model?: string;
  noExtension: boolean;
  printServer: boolean;
  /** Anything after `--` to forward to pi verbatim. */
  passthrough: string[];
}

function parseOptions(args: string[]): AgentOptions {
  const opt: AgentOptions = {
    noExtension: false,
    printServer: true,
    passthrough: [],
  };

  // Everything after a literal `--` is forwarded to pi.
  const dashDash = args.indexOf("--");
  const ownArgs = dashDash >= 0 ? args.slice(0, dashDash) : args;
  if (dashDash >= 0) opt.passthrough = args.slice(dashDash + 1);

  for (let i = 0; i < ownArgs.length; i++) {
    const a = ownArgs[i];
    if (a === undefined) continue;
    switch (a) {
      case "--cwd": {
        const v = ownArgs[++i];
        if (v !== undefined) opt.cwd = v;
        break;
      }
      case "--profile": {
        const v = ownArgs[++i];
        if (v !== undefined) opt.profile = v;
        break;
      }
      case "--model": {
        const v = ownArgs[++i];
        if (v !== undefined) opt.model = v;
        break;
      }
      case "--no-extension":
        opt.noExtension = true;
        break;
      case "--no-print-server":
        opt.printServer = false;
        break;
      default:
        // ignore unknown (could be a flag for pi before --)
        break;
    }
  }
  return opt;
}

export async function run(args: string[], _ctx: PilotContext): Promise<number> {
  const opt = parseOptions(args);

  // 1. Make sure pi is on PATH.
  const piOk = await isPiInstalled();
  if (!piOk) {
    console.error(
      kleur.red("✗ pi not found on PATH. Install: ") +
        kleur.cyan("npm install -g @earendil-works/pi-coding-agent"),
    );
    return 1;
  }

  // 2. Make sure pilot-tools extension is installed (unless opted out).
  if (!opt.noExtension) {
    const here = resolveInstallDir(dirname(fileURLToPath(import.meta.url)));
    const report = await installPilotTools(here);
    if (report.ok) {
      if (report.action === "created" || report.action === "replaced") {
        console.log(kleur.green("✓ ") + kleur.dim(report.message));
      }
      // "already-linked" → silent (don't spam the user every launch)
    } else {
      console.error(kleur.yellow("! ") + report.message);
      // Don't fail the launch — pi will still run, just without tools.
    }
  }

  // 3. Optionally activate a profile.
  if (opt.profile) {
    try {
      await _ctx.service.activateProfile(opt.profile);
      console.log(
        kleur.green("✓ ") + kleur.dim(`profile activated: ${opt.profile}`),
      );
    } catch (e) {
      console.error(
        kleur.yellow("! ") +
          kleur.dim(
            `could not activate profile '${opt.profile}': ${(e as Error).message}`,
          ),
      );
      // Non-fatal — pi can still run with the existing profile.
    }
  }

  // 4. Print the server hint (if any) before spawning pi so the user
  //    sees it in their terminal.
  if (opt.printServer) {
    const port = 17361;
    const reachable = await isPortOpen("127.0.0.1", port);
    if (reachable) {
      console.log(
        kleur.dim(
          `→ Pilot server live at http://127.0.0.1:${port} (pilot-tools can call it)`,
        ),
      );
    } else {
      console.log(
        kleur.yellow(
          `! Pilot server not running; pilot-tools will return errors until you start it: pilot dashboard`,
        ),
      );
    }
  }

  // 5. Build the pi argv.
  const piArgs: string[] = [];
  if (opt.cwd) {
    piArgs.push("--cwd", resolve(opt.cwd));
  }
  if (opt.model) {
    piArgs.push("--model", opt.model);
  }
  piArgs.push(...opt.passthrough);

  // 6. Spawn pi with stdio inherited (interactive TUI mode).
  //    Use `inherit` so the user's terminal control sequences flow
  //    through to pi's TUI. Forward SIGINT/SIGTERM cleanly.
  console.log(kleur.dim(`→ spawning: pi ${piArgs.join(" ")}`));
  console.log("");

  const child = spawn("pi", piArgs, {
    stdio: "inherit",
    env: process.env,
  });

  // Forward signals so child + parent stay in sync.
  const forward = (sig: NodeJS.Signals) => {
    if (!child.killed) child.kill(sig);
  };
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);

  return new Promise<number>((resolveP) => {
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      if (signal) {
        // Killed by signal — propagate as non-zero exit.
        resolveP(128 + (typeof signal === "string" ? 15 : signal));
      } else {
        resolveP(code ?? 0);
      }
    });
    child.on("error", (err) => {
      console.error(kleur.red("✗ spawn failed: ") + (err as Error).message);
      resolveP(1);
    });
  });
}

// Re-export so tests can use the same parseOptions shape if needed.
export { parseOptions };

/**
 * `pilot init` — first-run welcome + setup.
 *
 * v0.4.6: makes Pilot genuinely usable by someone who just
 * `npm install -g pilot` for the first time. Detects environment,
 * creates Pilot's home directory (idempotent), runs doctor, and
 * prints a curated next-steps cheatsheet.
 *
 * What it does:
 *   1. Verify Node version (≥ 20)
 *   2. Probe for `pi` on PATH
 *   3. Probe for `fd` (recommended)
 *   4. Create `~/.pilot/` + subdirs (idempotent)
 *   5. Print token file path (creates one if missing)
 *   6. Optional `--start` flag: also start the server in the background
 *   7. Print a "what now?" cheatsheet
 *
 * Idempotency: safe to run as many times as you want. Never destroys
 * existing data; only creates dirs that don't exist.
 *
 * Flags:
 *   --start         Start the server in background (uses server --bg)
 *   --no-open       Don't print "open browser" hint
 *   --json          Machine-readable output (for scripts)
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, exec as execCb } from "node:child_process";
import { promisify } from "node:util";

import kleur from "kleur";
import { isPiInstalled } from "../core/pi-cli.js";
import { pilotDir } from "../core/types.js";
import type { Command, PilotContext } from "../core/types.js";
import { isPortOpen } from "../utils/net.js";
import {
  installPilotTools,
  resolveInstallDir,
} from "../core/extension-installer.js";

export const manifest: Command = {
  name: "init",
  description:
    "First-run setup: detect environment, create ~/.pilot/, print cheatsheet",
};

interface InitReport {
  ok: boolean;
  node: string;
  nodeOk: boolean;
  piInstalled: boolean;
  fdInstalled: boolean;
  homeDir: string;
  homeCreated: boolean;
  doctorOk: boolean;
  doctorFailed: number;
  serverStarted: boolean;
  serverUrl?: string;
  token?: string;
  /** v0.5.4: status of pilot-tools extension install (created / already-linked / replaced / "") */
  extensionAction: string;
  steps: string[];
}

export async function run(args: string[], ctx: PilotContext): Promise<number> {
  const start = args.includes("--start");
  const noOpen = args.includes("--no-open");
  const json = args.includes("--json");

  const home = pilotDir(ctx.home);
  const homeExisted = existsSync(home);
  if (!homeExisted) {
    await mkdir(home, { recursive: true });
    // Subdirs that other commands expect.
    await Promise.all(
      [
        join(home, "extensions"),
        join(home, "policy"),
        join(home, "profiles"),
        join(home, "capabilities"),
      ].map((d) => mkdir(d, { recursive: true })),
    );
  }

  // ── Probe environment ───────────────────────────────────
  const nodeVersion = process.version.replace(/^v/, "");
  const nodeMajor = parseInt(nodeVersion.split(".")[0] ?? "0", 10);
  const nodeOk = nodeMajor >= 20;

  const piInstalled = await isPiInstalled();
  const fdInstalled = await isCommandAvailable("fd");

  // ── v0.5.4: install pilot-tools extension so `pilot agent`
  //    works out of the box. Idempotent — no-op if already linked.
  let extensionAction = "";
  if (piInstalled) {
    try {
      const here = resolveInstallDir(dirname(fileURLToPath(import.meta.url)));
      const r = await installPilotTools(here);
      if (r.ok) extensionAction = r.action;
    } catch {
      /* install is best-effort; user can retry via `pilot agent` */
    }
  }

  // ── Run doctor for the real report ──────────────────────
  const report = await ctx.service.runDoctor();

  // ── Optional: start the server ──────────────────────────
  let serverStarted = false;
  let serverUrl: string | undefined;
  let token: string | undefined;
  if (start) {
    const inUse = await isPortOpen("127.0.0.1", 17361);
    if (!inUse) {
      // Locate our own CLI script — `pilot init` may run from source
      // (tsx src/cli.ts) or installed (node dist/cli.js). Resolve to
      // the actual file path so the detached child can re-exec.
      const here = dirname(fileURLToPath(import.meta.url));
      const cliScript = here.endsWith("dist")
        ? join(here, "cli.js")
        : here.endsWith("commands")
          ? join(here, "..", "cli.ts")
          : join(here, "cli.js");

      const child = spawn(
        process.execPath,
        [
          ...(cliScript.endsWith(".ts") ? ["--import", "tsx/esm"] : []),
          cliScript,
          "server",
          "start",
          "--bg",
        ],
        {
          detached: true,
          stdio: "ignore",
          env: process.env,
        },
      );
      child.unref();
      serverStarted = true;
      serverUrl = "http://127.0.0.1:17361";
      // Wait briefly for the server to write its token file.
      await new Promise((r) => setTimeout(r, 800));
    } else {
      serverStarted = true;
      serverUrl = "http://127.0.0.1:17361";
    }
    try {
      const { readFile } = await import("node:fs/promises");
      const t = await readFile(join(home, "server.token"), "utf-8");
      token = t.trim();
    } catch {
      /* server might not have written yet */
    }
  }

  // ── Build cheatsheet steps based on what's missing ──────
  const steps: string[] = [];
  if (!nodeOk) {
    steps.push(
      `Upgrade Node: you have ${nodeVersion}, need ≥ 20. See https://nodejs.org`,
    );
  }
  if (!piInstalled) {
    steps.push(
      `Install Pi: ${kleur.cyan("npm install -g @earendil-works/pi-coding-agent")} (see https://pi.dev)`,
    );
  }
  if (!fdInstalled) {
    steps.push(
      `Optional: ${kleur.cyan("brew install fd")} (faster file scanning, recommended)`,
    );
  }
  if (!report.ok) {
    steps.push(
      `Fix doctor issues: ${kleur.cyan("pilot doctor")} (run again to re-check)`,
    );
  }
  if (!start) {
    steps.push(
      `Start the dashboard: ${kleur.cyan("pilot dashboard")} (or ${kleur.cyan("pilot dashboard --prod")} for production mode)`,
    );
  }
  if (steps.length === 0 || (piInstalled && report.ok)) {
    steps.push(
      `Try the policy demo: ${kleur.cyan("pilot policy new demo && pilot policy apply demo && pilot policy show demo")}`,
    );
  }
  if (piInstalled) {
    steps.push(
      `Launch Pi with Pilot's tools loaded: ${kleur.cyan("pilot agent")} (Co-pilot mode)`,
    );
  }
  steps.push(`Run ${kleur.cyan("pilot --help")} to see all commands`);

  const result: InitReport = {
    ok: nodeOk && piInstalled && report.ok,
    node: nodeVersion,
    nodeOk,
    piInstalled,
    fdInstalled,
    homeDir: home,
    homeCreated: !homeExisted,
    doctorOk: report.ok,
    doctorFailed: report.failed,
    serverStarted,
    ...(serverUrl ? { serverUrl } : {}),
    ...(token ? { token } : {}),
    extensionAction,
    steps,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  printBanner(result, noOpen);
  return result.ok ? 0 : 1;
}

function printBanner(r: InitReport, noOpen: boolean): void {
  const lines: string[] = [];
  lines.push(kleur.bold().underline("Pilot Setup"));
  lines.push("");

  // Environment probes
  const nodeMajor = parseInt(r.node.split(".")[0] ?? "0", 10);
  lines.push(`  ${probe(nodeMajor >= 20, false)} Node ${r.node}`);
  lines.push(
    `  ${probe(r.piInstalled)} ${r.piInstalled ? "pi on PATH" : "pi NOT found"}`,
  );
  lines.push(
    `  ${probe(r.fdInstalled, true)} ${r.fdInstalled ? "fd installed" : "fd missing (recommended)"}`,
  );

  // Home directory
  lines.push("");
  if (r.homeCreated) {
    lines.push(kleur.green("  ✓ Created home: ") + kleur.cyan(r.homeDir));
  } else {
    lines.push(kleur.dim(`  = Home exists: ${r.homeDir}`));
  }

  // Doctor
  lines.push("");
  lines.push(kleur.bold("  Doctor"));
  for (const c of r.doctorOk
    ? ["All checks passed."]
    : [`${r.doctorFailed} issue(s).`]) {
    lines.push(`    ${r.doctorOk ? kleur.green("✓") : kleur.yellow("!")} ${c}`);
  }

  // Server status
  if (r.serverStarted) {
    lines.push("");
    lines.push(kleur.green("  ✓ Server running"));
    if (r.serverUrl) lines.push(`    URL:   ${kleur.cyan(r.serverUrl)}`);
    if (r.token)
      lines.push(`    Token: ${kleur.dim(r.token.slice(0, 12) + "…")}`);
  }

  // v0.5.4: pilot-tools extension status (Co-pilot bridge).
  if (r.extensionAction === "created") {
    lines.push("");
    lines.push(kleur.green("  ✓ pilot-tools extension installed"));
    lines.push(kleur.dim("    Pi's LLM can now call Pilot commands"));
  } else if (r.extensionAction === "replaced") {
    lines.push("");
    lines.push(kleur.green("  ✓ pilot-tools extension re-linked"));
  }

  // Cheatsheet
  lines.push("");
  lines.push(kleur.bold("Next steps"));
  for (const s of r.steps) {
    lines.push(`  → ${s}`);
  }

  // Browser hint
  if (r.serverStarted && !noOpen) {
    lines.push("");
    lines.push(kleur.dim("  → Open http://127.0.0.1:17361/health to verify"));
  }

  console.log(lines.join("\n"));
}

function probe(ok: boolean, soft = false): string {
  if (ok) return kleur.green("✓");
  if (soft) return kleur.yellow("~");
  return kleur.red("✗");
}

/** Check if a command is on PATH. */
async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    await promisify(execCb)(`command -v ${cmd}`);
    return true;
  } catch {
    return false;
  }
}

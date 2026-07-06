/**
 * core/extension-installer.ts — manage the pilot-tools Pi extension
 * (v0.5.4 Co-pilot mode).
 *
 * Pilot ships a Pi extension at `<install-dir>/extensions/pilot-tools.ts`
 * (or `<install-dir>/../src/extensions/pilot-tools.ts` when running from
 * source via tsx). To make Pi auto-load it, we symlink it into Pi's
 * auto-discover location at `~/.pi/agent/extensions/pilot-tools.ts`.
 *
 * ## Why a symlink (not a copy)
 *
 * Editing the extension source + `/reload` in Pi picks up changes
 * immediately, no re-install dance. Same code path as development.
 *
 * ## Idempotency
 *
 * - Link already exists and points to our source → no-op
 * - Link exists but points elsewhere → replace
 * - Regular file exists at target → refuse (don't silently clobber
 *   a user's hand-written extension)
 * - Dir doesn't exist → create
 *
 * Returns a small `InstallReport` so the CLI can print what changed.
 */
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

export interface InstallReport {
  ok: boolean;
  source: string;
  target: string;
  /** "created" | "already-linked" | "replaced" | "skipped-conflict" */
  action: "created" | "already-linked" | "replaced" | "skipped-conflict";
  message: string;
}

const EXT_FILENAME = "pilot-tools.ts";

/**
 * Locate the pilot-tools.ts source. Tries both prod layout
 * (`<install-dir>/extensions/`) and dev layout
 * (`<install-dir>/../src/extensions/`) so the same binary works in
 * both modes.
 */
export function findPilotToolsSource(installDir: string): string | null {
  const candidates = [
    join(installDir, "extensions", EXT_FILENAME),
    join(installDir, "..", "src", "extensions", EXT_FILENAME),
    join(installDir, "..", "..", "src", "extensions", EXT_FILENAME),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Get the target path Pi will auto-discover.
 * Respects `$PI_AGENT_DIR` if set (some users point Pi at a custom dir),
 * otherwise falls back to `$HOME/.pi/agent/extensions/pilot-tools.ts`.
 *
 * `$HOME` is read explicitly (not via `os.homedir()`) so tests can
 * override it via `process.env.HOME`.
 */
export function getExtensionTargetPath(): string {
  const piAgentDir =
    process.env.PI_AGENT_DIR ??
    join(process.env.HOME ?? homedir(), ".pi", "agent");
  return join(piAgentDir, "extensions", EXT_FILENAME);
}

/**
 * Install (symlink) pilot-tools.ts into Pi's auto-discover directory.
 *
 * Returns an InstallReport describing what happened. Does NOT throw —
 * conflict cases return `ok: false` with a clear message.
 */
export async function installPilotTools(
  installDir: string,
): Promise<InstallReport> {
  const source = findPilotToolsSource(installDir);
  if (!source) {
    return {
      ok: false,
      source: "",
      target: getExtensionTargetPath(),
      action: "skipped-conflict",
      message:
        "pilot-tools.ts not found in expected locations — was pilot installed correctly?",
    };
  }

  const target = getExtensionTargetPath();

  // Ensure ~/.pi/agent/extensions/ exists.
  await mkdir(dirname(target), { recursive: true });

  // Case 1: target already exists (file, symlink, or dangling symlink).
  let targetExists = false;
  let targetIsSymlink = false;
  let existingTarget: string | null = null;
  try {
    const stat = lstatSync(target);
    targetExists = true;
    targetIsSymlink = stat.isSymbolicLink();
    if (targetIsSymlink) {
      const { readlinkSync } = await import("node:fs");
      existingTarget = readlinkSync(target);
    }
  } catch {
    /* target doesn't exist — fall through to create */
  }

  if (targetExists) {
    // Symlink (possibly dangling): compare its target to our source.
    if (targetIsSymlink && existingTarget !== null) {
      const realExisting = isAbsolute(existingTarget)
        ? existingTarget
        : resolve(dirname(target), existingTarget);
      const realSource = source;
      if (realExisting === realSource) {
        return {
          ok: true,
          source,
          target,
          action: "already-linked",
          message: "pilot-tools is already linked to the right source",
        };
      }
      // Stale link — replace it.
      try {
        unlinkSync(target);
      } catch (e) {
        return {
          ok: false,
          source,
          target,
          action: "skipped-conflict",
          message: `couldn't remove stale symlink: ${(e as Error).message}`,
        };
      }
      symlinkSync(source, target);
      return {
        ok: true,
        source,
        target,
        action: "replaced",
        message: `replaced stale symlink (was → ${realExisting})`,
      };
    }

    // Regular file at target → don't clobber.
    return {
      ok: false,
      source,
      target,
      action: "skipped-conflict",
      message:
        "a non-symlink file already exists at the target path; refusing to clobber it (move it aside first, then run `pilot agent` again)",
    };
  }

  // Case 3: create fresh symlink.
  symlinkSync(source, target);
  return {
    ok: true,
    source,
    target,
    action: "created",
    message: `linked ${source} → ${target}`,
  };
}

/**
 * Resolve pilot's install directory from a CLI entry point path.
 * Walks up to find package.json (or stops at dist/ for installed mode).
 */
export function resolveInstallDir(cliEntry: string): string {
  // cliEntry is typically /abs/path/to/dist/cli.js or /abs/path/to/src/cli.ts
  return dirname(cliEntry);
}

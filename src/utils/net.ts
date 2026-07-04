/**
 * Tiny network utilities used by commands.
 *
 * Avoid pulling in `node:net`'s heavyweight APIs when we only need
 * "is anything listening on host:port?". We do a non-blocking TCP
 * connect attempt and resolve on success / ECONNREFUSED, reject
 * on timeout.
 *
 * Also provides `pidListeningOnPort` + `killProcessTree` so callers
 * (notably `pilot dashboard`) can detect a stale previous Pilot
 * instance and clean it up instead of failing with EADDRINUSE.
 */

import { createConnection } from "node:net";
import type { Socket } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * Probe a TCP port. Returns true if something is listening.
 * Resolves false on ECONNREFUSED, ETIMEDOUT, or any other error.
 *
 * Race against a 1s timeout — never hangs.
 */
export function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolveP) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolveP(ok);
    };
    let sock: Socket;
    try {
      sock = createConnection({ host, port });
    } catch {
      finish(false);
      return;
    }
    sock.once("connect", () => {
      sock.destroy();
      finish(true);
    });
    sock.once("error", () => {
      sock.destroy();
      finish(false);
    });
    setTimeout(() => {
      sock.destroy();
      finish(false);
    }, 1_000);
  });
}

/**
 * Best-effort: find the PID(s) listening on a TCP port.
 *
 * Returns an empty array on platforms where we can't determine the
 * owner (Windows, sandboxed macOS, no `lsof` / `ss`). Callers must
 * treat `[]` as "unknown — proceed with caution or surface to the user".
 *
 * Strategy:
 *   - macOS / Linux: `lsof -nP -iTCP:<port> -sTCP:LISTEN -t` (one PID per line)
 *   - Linux fallback: `ss -ltnp 'sport = :<port>'`
 *   - Windows: not implemented (returns [])
 *
 * The `lsof` flag set is intentional:
 *   - `-n` skip DNS reverse-lookup (fast)
 *   - `-P` skip service-name lookup (so port is a number, not "http")
 *   - `-iTCP:<port>` only TCP on this port
 *   - `-sTCP:LISTEN` only the listening socket, not established conns
 *   - `-t` terse output = PIDs only
 */
export async function pidListeningOnPort(port: number): Promise<number[]> {
  if (process.platform === "win32") return [];

  // Try lsof first — most universally available on macOS + Linux.
  try {
    const { stdout } = await execFileP("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    return stdout
      .split("\n")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    // lsof missing or returned non-zero; try ss.
  }

  if (process.platform === "linux") {
    try {
      const { stdout } = await execFileP("ss", ["-ltnp", `sport = :${port}`]);
      // ss prints lines like: users:(("node",pid=12345,fd=22))
      const pids: number[] = [];
      const re = /pid=(\d+)/g;
      for (const line of stdout.split("\n")) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(line))) {
          const pid = Number(m[1]);
          if (Number.isInteger(pid) && pid > 0) pids.push(pid);
        }
      }
      return pids;
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Read the argv (truncated to the first 200 chars) of a running
 * process via `ps -p <pid> -o args=`. Used to decide whether a PID
 * listening on our port is a previous Pilot instance (safe to kill)
 * or someone else's process (must not kill).
 *
 * Returns null when the process can't be inspected (gone, no ps,
 * permission denied). Callers must treat null as "unknown — bail out".
 */
export async function processCommandLine(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileP("ps", [
      "-p",
      String(pid),
      "-o",
      "args=",
    ]);
    const line = stdout.split("\n")[0]?.trim() ?? "";
    return line.length > 0 ? line.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort detection: "is this PID a previous Pilot instance we
 * can safely kill to free a port?"
 *
 * We consider a process a Pilot instance if its command line
 * matches any of:
 *   - starts with `pilot ` (CLI invocations)
 *   - contains `node_modules/pilot/` (running the CLI via npx/path)
 *   - contains `/pilot dashboard` or `/pilot server` (script entry)
 *   - is `next-server` / `next dev` (the Web UI half of `pilot dashboard`)
 *
 * Everything else is "foreign — don't kill". Better to make the user
 * run `lsof -i :PORT` themselves than to nuke their editor's LSP.
 */
export function looksLikePilotProcess(cmdline: string): boolean {
  if (!cmdline) return false;
  return (
    cmdline.startsWith("pilot ") ||
    cmdline.includes("node_modules/pilot") ||
    // Match `pilot/dist/cli.js` (npm-packaged CLI), not just `node_modules/pilot/`.
    cmdline.includes("/pilot/dist/") ||
    cmdline.includes("/pilot dashboard") ||
    cmdline.includes("/pilot server") ||
    cmdline.includes("next-server") ||
    cmdline.includes("next dev")
  );
}

/**
 * Kill a PID + its process group. Sends SIGTERM first; if the
 * process is still alive after 2s, escalates to SIGKILL.
 *
 * Returns true when the process is gone at exit. Returns false
 * when the kill signal couldn't be sent (ESRCH / EPERM) — callers
 * should surface that to the user.
 */
export async function killProcessTree(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return false;
    }
  }

  // Wait up to 2s for the process to exit cleanly.
  for (let i = 0; i < 20; i++) {
    try {
      // signal 0 = "does this pid exist?"
      process.kill(pid, 0);
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      return true; // ESRCH = gone, we're done
    }
  }

  // Still alive — escalate.
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      return false;
    }
  }
  await new Promise((r) => setTimeout(r, 200));
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

/**
 * Wait for a port to become free. Polls `isPortOpen` every 200ms
 * up to `maxMs`. Returns true when the port is free, false on timeout.
 */
export async function waitForPortFree(
  host: string,
  port: number,
  maxMs: number = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(host, port))) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !(await isPortOpen(host, port));
}

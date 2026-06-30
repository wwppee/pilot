/**
 * pi CLI wrapper.
 *
 * Pilot doesn't run pi's logic — it shells out to `pi` for anything that
 * modifies state (install, update, remove). Pilot adds management features
 * ON TOP of what pi provides.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface PiExecOptions {
  /** Args after `pi`. */
  args: string[];
  /** Working directory. Defaults to process.cwd(). */
  cwd?: string;
  /** If true, suppress non-zero exit throwing (just return the result). */
  tolerateFailure?: boolean;
}

export interface PiExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run `pi <args>` and capture output.
 *
 * @throws if pi exits non-zero (unless `tolerateFailure` is set).
 */
export async function runPi(opts: PiExecOptions): Promise<PiExecResult> {
  try {
    const { stdout, stderr } = await exec('pi', opts.args, {
      cwd: opts.cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    // execFile throws on non-zero exit; capture what we can.
    const e = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    if (opts.tolerateFailure) {
      return {
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? '',
        exitCode: typeof e.code === 'number' ? e.code : 1,
      };
    }
    throw err;
  }
}

/**
 * Run `pi <args>` with stdio inherited — output streams directly to the user's
 * terminal. Use this for long-running operations (install, update) where
 * progress matters.
 *
 * Resolves with the exit code on success. Throws on non-zero exit.
 */
export async function runPiStreaming(args: string[], opts?: { cwd?: string }): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('pi', args, {
      cwd: opts?.cwd,
      stdio: 'inherit',
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`pi exited with code ${code}`));
    });
  });
}

/** Check whether the `pi` binary is on PATH. */
export async function isPiInstalled(): Promise<boolean> {
  try {
    await exec('pi', ['--version']);
    return true;
  } catch {
    return false;
  }
}
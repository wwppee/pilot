/**
 * core/pi-session-runner.ts — execute a `pi_session` plan step.
 *
 * v0.6.0: a plan's `pi_session` action spawns its own `pi --mode
 * rpc` subprocess, sends a single prompt, waits for completion,
 * and returns the final assistant text + token stats. The runner
 * is single-shot (one prompt → idle → stop); the v0.6.0+ async
 * / multi-turn case is out of scope (plan steps that need
 * follow-ups should be multiple `pi_session` actions).
 *
 * v0.6.1: cleanup() now explicitly removes the abort listener
 * (P1 fix — long plans were accumulating closures on the
 * caller's signal). Data object no longer contains a phantom
 * `events: undefined` key (P2 fix). durationMs is now a real
 * value, not a hardcoded 0 (P1 fix forwarded to the caller).
 *
 * Why not reuse `pi-rpc-bridge.ts`? The bridge assumes a
 * WebSocket client on the other end (it proxies JSON-lines
 * messages to a browser tab). The plan executor has no client
 * — it just needs the prompt→events→result flow. So we build a
 * thin wrapper directly on the upstream `RpcClient`.
 *
 * Lifecycle:
 *   1. `start()` — spawn `pi --mode rpc`, wait for initial events
 *      to settle.
 *   2. `run(prompt)` — `promptAndWait(prompt)`, capture all events,
 *      ask for last-assistant-text + session-stats.
 *   3. `stop()` — close the subprocess.
 *
 * Cancellation:
 *   The runner's `run(prompt, signal)` accepts an AbortSignal.
 *   On abort: call `rpc.abort()` (best-effort), then `stop()`.
 *   We do NOT throw on abort — the step is marked as cancelled
 *   via the surrounding PlanExecutor logic, not by the runner
 *   itself.
 */

import { RpcClient } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { StepOutput } from "./plan.js";

/**
 * Resolve the absolute path to pi's CLI entry point.
 *
 * The @earendil-works/pi-coding-agent package installs both the
 * `pi` shim (in node_modules/.../bin/pi) and a dist/cli.js. The
 * SDK's `RpcClient` spawns `node <cliPath>` directly, so we need
 * the cli.js path — not the shim.
 *
 * v0.6.0: lifted verbatim from server/pi-rpc-bridge.ts (it was
 * the only caller before; now we have two). When v0.6.0+ adds
 * a third caller, this becomes a `core/pi-cli-path.ts`.
 */
function resolvePiCliPath(): string {
  // Try `npm root -g` first.
  try {
    const root = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const candidate = `${root}/@earendil-works/pi-coding-agent/dist/cli.js`;
    if (existsSync(candidate)) return candidate;
  } catch {
    // npm not on PATH or failed — fall through.
  }
  // Fall back to `which pi`. The shim's shebang re-launches node,
  // so passing it as cliPath to RpcClient (which spawns `node <path>`)
  // is one extra node hop but functionally correct.
  try {
    const which = execSync("which pi", { encoding: "utf-8" }).trim();
    if (which) return which;
  } catch {
    // pi not on PATH.
  }
  // Last resort.
  return "dist/cli.js";
}

export interface PiSessionRunnerOptions {
  /** Working directory for the pi subprocess. */
  cwd: string;
  /** Optional model override. */
  model?: string;
  /** Optional provider override. */
  provider?: string;
  /** Per-step timeout in ms. Default 5 minutes. */
  timeoutMs?: number;
}

export interface PiSessionResult {
  /** Final assistant message text (truncated to 4 KB). */
  lastText: string | null;
  /** Number of events received during this run. */
  eventCount: number;
  /** Token usage reported by pi. */
  tokensUsed?: number;
  /** Cost in USD reported by pi. */
  cost?: number;
  /** Wall-clock duration of the run. */
  durationMs: number;
}

/**
 * Single-shot pi session runner. Each `run()` call spawns a fresh
 * pi subprocess. The constructor does NOT spawn — call `run()`.
 *
 * Designed to be used as an `ActionHandler` in the plan executor:
 *   const runner = new PiSessionRunner({ cwd });
 *   const output = await runner.run(prompt, signal);
 */
export class PiSessionRunner {
  private options: Required<
    Omit<PiSessionRunnerOptions, "model" | "provider">
  > &
    Pick<PiSessionRunnerOptions, "model" | "provider">;
  private rpc: RpcClient | null = null;
  private abortSignal: AbortSignal | null = null;
  private abortListener: (() => void) | null = null;

  constructor(options: PiSessionRunnerOptions) {
    this.options = {
      cwd: options.cwd,
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      timeoutMs: options.timeoutMs ?? 5 * 60 * 1000,
    };
  }

  /**
   * Run a prompt and wait for pi to complete. Returns the
   * final assistant text + token stats as a StepOutput.
   *
   * Throws on:
   *   - pi subprocess fails to start (pi not installed, cliPath
   *     missing, etc.)
   *   - pi exits non-zero
   *   - timeout (after `timeoutMs`)
   *   - signal abort
   */
  async run(prompt: string, signal: AbortSignal): Promise<StepOutput> {
    const start = Date.now();
    this.rpc = new RpcClient({
      cwd: this.options.cwd,
      cliPath: resolvePiCliPath(),
      ...(this.options.provider !== undefined
        ? { provider: this.options.provider }
        : {}),
      ...(this.options.model !== undefined
        ? { model: this.options.model }
        : {}),
    });

    // Wire abort to rpc.abort() so cancelling the plan also
    // aborts the in-flight pi call. cleanup() removes this
    // listener so long plans don't accumulate closures on
    // the caller's signal.
    this.abortSignal = signal;
    this.abortListener = () => {
      void this.rpc?.abort().catch(() => undefined);
    };
    if (signal.aborted) {
      await this.cleanup();
      throw new Error("pi session aborted before start");
    }
    signal.addEventListener("abort", this.abortListener, { once: true });

    try {
      await this.rpc.start();
      const events = await this.rpc.promptAndWait(
        prompt,
        undefined,
        this.options.timeoutMs,
      );
      // After promptAndWait, the agent is idle. Pull the final
      // text + stats.
      const lastText = await this.rpc.getLastAssistantText();
      let tokensUsed: number | undefined;
      let cost: number | undefined;
      try {
        const stats = await this.rpc.getSessionStats();
        if (stats.tokens && typeof stats.tokens.total === "number") {
          tokensUsed = stats.tokens.total;
        }
        if (typeof stats.cost === "number") {
          cost = stats.cost;
        }
      } catch {
        // Some pi builds don't have getSessionStats; ignore.
      }
      const durationMs = Date.now() - start;
      // P2 fix: build a clean data object — no `events: undefined`
      // keys leaking into JSONL. Only emit fields that have values.
      const data: Record<string, unknown> = {
        lastText: lastText ? lastText.slice(0, 4096) : null,
        eventCount: events.length,
        durationMs,
      };
      if (tokensUsed !== undefined) {
        data.tokensUsed = tokensUsed;
        data.cost = cost;
      }
      const summary = lastText
        ? lastText.slice(0, 200).replace(/\s+/g, " ").trim()
        : "(no assistant text)";
      return {
        success: true,
        summary,
        data,
        // P1 fix: always fill the real durationMs, not 0.
        ...(tokensUsed !== undefined ? { tokensUsed } : {}),
        durationMs,
      };
    } catch (err) {
      // Re-throw with a friendlier message.
      const msg = (err as Error).message;
      throw new Error(`pi_session failed: ${msg}`);
    } finally {
      await this.cleanup();
    }
  }

  private async cleanup(): Promise<void> {
    // P1 fix: explicitly remove the abort listener so long
    // plans don't accumulate closures on the caller's signal.
    if (this.abortSignal && this.abortListener) {
      this.abortSignal.removeEventListener("abort", this.abortListener);
    }
    this.abortSignal = null;
    this.abortListener = null;
    if (this.rpc) {
      try {
        await this.rpc.stop();
      } catch {
        // Best-effort.
      }
      this.rpc = null;
    }
  }
}

/**
 * Convenience: one-shot wrapper. The plan executor uses this.
 * `signal` is required (the executor always has one).
 */
export async function runPiSession(
  prompt: string,
  options: PiSessionRunnerOptions,
  signal: AbortSignal,
): Promise<StepOutput> {
  const runner = new PiSessionRunner(options);
  return runner.run(prompt, signal);
}

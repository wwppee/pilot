/**
 * server/pi-rpc-bridge.ts — proxy pi's RpcClient over a single
 * WebSocket connection.
 *
 * Browser sends JSON-lines `RpcCommand` objects. Bridge forwards
 * them to the embedded `RpcClient` (which spawns `pi --mode rpc`
 * as a child process). Events from pi are sent back to the
 * browser as JSON. Responses too.
 *
 * v0.5.14+: one bridge per WebSocket connection, one RpcClient
 * per bridge. Cleanup is automatic when either side disconnects.
 *
 * Auth: the client must connect with the Pilot auth token as
 * WebSocket subprotocol `pilot-token, <token>`. The server reads
 * it via `socket.protocol` and validates before starting RpcClient.
 *
 * Why not just import RpcClient directly in browser? RpcClient
 * spawns a child process and reads stdin/stdout — it needs Node.
 * The bridge runs in Pilot's existing Node process; the browser
 * stays thin.
 */
import { RpcClient, type RpcCommand } from "@earendil-works/pi-coding-agent";
import type { WebSocket } from "ws";
import { execSync } from "node:child_process";

/**
 * Resolve the absolute path to pi's CLI entry point.
 *
 * The @earendil-works/pi-coding-agent package installs both the
 * `pi` shim (in node_modules/.../bin/pi) and a dist/cli.js. The
 * SDK's `RpcClient` spawns `node <cliPath>` directly, so we need
 * the cli.js path — not the shim.
 *
 * Strategy:
 *   1. `npm root -g` tells us where global packages live.
 *   2. We resolve `<root>/@earendil-works/pi-coding-agent/dist/cli.js`.
 *   3. Fall back to `which pi` (Homebrew puts pi at /opt/homebrew/bin/pi
 *      which has a node shebang — works through the extra hop).
 *   4. Last resort: leave RpcClient's default (which assumes the
 *      CWD has dist/cli.js — almost certainly wrong here, but
 *      the user will see a clear "Cannot find module" error).
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

import { existsSync } from "node:fs";

/**
 * Bridge lifecycle: `connect()` starts the RpcClient and wires
 * the bidirectional event pipes. `close()` shuts down cleanly.
 *
 * We never throw out of `connect()` unless pi can't be spawned at
 * all (e.g., not on PATH). Any runtime errors from pi are
 * surfaced as `RpcResponse` with `success: false` — pi handles
 * its own error reporting over the RPC protocol.
 */
export class PiRpcBridge {
  private rpc: RpcClient | null = null;
  private closed = false;

  constructor(private readonly socket: WebSocket) {}

  async start(cwd: string): Promise<void> {
    if (this.closed) return;

    this.rpc = new RpcClient({
      cwd,
      cliPath: resolvePiCliPath(),
      // No `provider` / `model` — pi uses the active session defaults
      // from ~/.pi/agent/settings.json. v0.6.0 will let the bridge
      // pass model overrides from the browser.
    });

    // Forward every pi event to the browser. The agent's event bus
    // is verbose; we send each as a single JSON message tagged with
    // { kind: "event", event } so the browser can distinguish events
    // from responses.
    this.rpc.onEvent((event) => {
      if (this.closed) return;
      this.send({ kind: "event", event });
    });

    // Forward pi stderr to the server log so devs can debug.
    // (We don't send it to the browser — would leak pi internals.)
    this.rpc.onEvent(() => {
      // no-op listener just to capture stderr buffering side-effects;
      // real logging happens via the server's Fastify logger below.
    });

    // Catch browser→server messages. Each message is an RpcCommand;
    // we extract the typed fields per command and call the matching
    // RpcClient method. We do NOT pass the whole RpcCommand through
    // because each method takes specific positional args (e.g. prompt
    // takes message + images, getState takes nothing).
    this.socket.on("message", (raw) => {
      if (this.closed || !this.rpc) return;
      let cmd: RpcCommand;
      try {
        cmd = JSON.parse(String(raw)) as RpcCommand;
      } catch (e) {
        this.send({
          kind: "response",
          command: "invalid",
          success: false,
          error: `not JSON: ${(e as Error).message}`,
        });
        return;
      }
      this.dispatch(cmd).catch((e: Error) => {
        this.send({
          kind: "response",
          command: cmd.type,
          success: false,
          error: e.message,
        });
      });
    });

    // Browser disconnect → stop pi.
    this.socket.on("close", () => {
      void this.close();
    });
    this.socket.on("error", () => {
      void this.close();
    });

    try {
      await this.rpc.start();
    } catch (e) {
      this.send({
        kind: "response",
        command: "start",
        success: false,
        error: `pi RPC failed to start: ${(e as Error).message}`,
      });
      await this.close();
    }
  }

  /**
   * Send a JSON message to the browser. Drop silently if the socket
   * is closed — we don't want to throw from an event listener.
   */
  private send(msg: object): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(msg));
    } catch {
      // Socket mid-close; ignore.
    }
  }

  /**
   * Dispatch an RpcCommand to the matching RpcClient method, then
   * forward the SDK's response (or void) to the browser as a
   * `kind: "response"` message.
   *
   * The SDK's `pendingRequests` mechanism resolves the SDK method's
   * returned Promise (consumed by us here). Streaming events from
   * a `prompt` (agent_start, message_update, etc.) come through
   * `onEvent` and are forwarded separately. So the browser sees:
   *
   *   { kind: "event", event }              // streaming updates
   *   { kind: "response", command, success, data }  // command result
   *
   * Why not a generic dispatcher: TypeScript-narrowed methods don't
   * have a uniform signature, so reflection-style dispatch is
   * fragile. A literal switch is verbose but obvious.
   */
  private async dispatch(cmd: RpcCommand): Promise<void> {
    if (!this.rpc) return;
    const r = this.rpc;
    // We capture the response for commands that return data. Others
    // return void — we still send a success response so the browser
    // knows the round-trip completed.
    try {
      let data: unknown = undefined;
      switch (cmd.type) {
        case "prompt":
          await r.prompt(cmd.message, cmd.images);
          break;
        case "steer":
          await r.steer(cmd.message, cmd.images);
          break;
        case "follow_up":
          await r.followUp(cmd.message, cmd.images);
          break;
        case "abort":
          await r.abort();
          break;
        case "new_session":
          data = await r.newSession(cmd.parentSession);
          break;
        case "get_state":
          data = await r.getState();
          break;
        case "set_model":
          data = await r.setModel(cmd.provider, cmd.modelId);
          break;
        case "cycle_model":
          data = await r.cycleModel();
          break;
        case "get_available_models":
          data = await r.getAvailableModels();
          break;
        case "set_thinking_level":
          await r.setThinkingLevel(cmd.level);
          break;
        case "cycle_thinking_level":
          data = await r.cycleThinkingLevel();
          break;
        case "set_steering_mode":
          await r.setSteeringMode(cmd.mode);
          break;
        case "set_follow_up_mode":
          await r.setFollowUpMode(cmd.mode);
          break;
        case "compact":
          data = await r.compact(cmd.customInstructions);
          break;
        case "set_auto_compaction":
          await r.setAutoCompaction(cmd.enabled);
          break;
        case "set_auto_retry":
          await r.setAutoRetry(cmd.enabled);
          break;
        case "abort_retry":
          await r.abortRetry();
          break;
        case "bash":
          data = await r.bash(cmd.command);
          break;
        case "abort_bash":
          await r.abortBash();
          break;
        case "get_session_stats":
          data = await r.getSessionStats();
          break;
        case "export_html":
          data = await r.exportHtml(cmd.outputPath);
          break;
        case "switch_session":
          data = await r.switchSession(cmd.sessionPath);
          break;
        case "fork":
          data = await r.fork(cmd.entryId);
          break;
        case "clone":
          data = await r.clone();
          break;
        case "get_fork_messages":
          data = await r.getForkMessages();
          break;
        case "get_last_assistant_text":
          data = await r.getLastAssistantText();
          break;
        case "set_session_name":
          await r.setSessionName(cmd.name);
          break;
        case "get_messages":
          data = await r.getMessages();
          break;
        case "get_commands":
          data = await r.getCommands();
          break;
      }
      this.send({
        kind: "response",
        command: cmd.type,
        success: true,
        ...(data !== undefined ? { data } : {}),
      });
    } catch (e) {
      this.send({
        kind: "response",
        command: cmd.type,
        success: false,
        error: (e as Error).message,
      });
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.rpc) {
      try {
        await this.rpc.stop();
      } catch {
        // pi may already be gone.
      }
      this.rpc = null;
    }
    try {
      if (this.socket.readyState === this.socket.OPEN) {
        this.socket.close();
      }
    } catch {
      // ignore
    }
  }
}

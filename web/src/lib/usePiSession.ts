"use client";

/**
 * usePiSession — browser-side wrapper around the Pilot WebSocket
 * pi RPC bridge.
 *
 * Lifecycle:
 *   1. On mount, fetch the auth token from `/api/pi/token` (server-
 *      side read of `~/.pilot/server.token`).
 *   2. Open `ws://127.0.0.1:17361/api/pi/ws` with subprotocol
 *      `pilot-token-<token>`.
 *   3. Server validates the subprotocol and starts an RpcClient
 *      (which spawns `pi --mode rpc` as a child process).
 *   4. Each JSON message from the server is split into events
 *      (`{kind: "event", event}`) and command responses
 *      (`{kind: "response", command, success, ...}`). Events go
 *      into the streaming log; responses resolve the matching
 *      pending command.
 *
 * v0.5.14+: this is the foundation for the v0.6.0 PlanExecutor
 * (each Plan step that calls pi_session will reuse this hook).
 *
 * P0#1 (v0.5.14.1): every `send()` tags its command with a
 * unique id; the bridge echoes the id back on its response, so we
 * match pending Promises by id (FIFO fallback for old bridges).
 * Without id-matching, two in-flight commands of the same type
 * (e.g. two `prompt`s) would deadlock — the first response would
 * resolve the second Promise.
 *
 * P1#2 (v0.5.14.1): every pending command has a 30s timeout.
 * Without it, a hung pi subprocess would leave the UI stuck on
 * "Sending…" forever.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PILOT_WS_BASE =
  process.env.NEXT_PUBLIC_PILOT_WS_URL ?? "ws://127.0.0.1:17361";
const COMMAND_TIMEOUT_MS = 30_000;

// v0.9.10: WebSocket auto-reconnect. agegr/pi-web uses
// SSE which the browser auto-reconnects; pilot uses
// WebSocket which doesn't. Without reconnect, a brief
// server restart or network blip drops the user out
// of /try mid-session. Backoff is exponential with a
// cap; we give up after 5 attempts and surface a
// "gave up" state so the user can manually retry
// rather than the UI silently hanging on
// "reconnecting" forever.
const RECONNECT_BACKOFFS_MS = [1000, 2000, 4000, 8000, 16000];
const RECONNECT_MAX_ATTEMPTS = RECONNECT_BACKOFFS_MS.length;

export type PiStreamEvent = {
  kind: "event";
  event: {
    type: string;
    [k: string]: unknown;
  };
};

export type PiCommandResponse =
  | {
      kind: "response";
      command: string;
      success: true;
      data?: unknown;
      id?: string;
    }
  | {
      kind: "response";
      command: string;
      success: false;
      error: string;
      id?: string;
    };

export type PiConnectionState =
  | "idle"
  | "fetching-token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type PiMessage = PiStreamEvent | PiCommandResponse;

export interface PiSession {
  /** Current connection state. */
  state: PiConnectionState;
  /** Last error (transient — see `state` for status). */
  error: string | null;
  /**
   * v0.9.10: 1-based reconnect attempt counter.
   * 0 when not reconnecting, increments to 1..5
   * during backoff, and stays at the final value
   * after the cap is hit. The /try status bar reads
   * this to render "Reconnecting (3/5)…".
   */
  reconnectAttempt: number;
  /** Streaming events from pi, in arrival order. */
  events: PiStreamEvent[];
  /** Open a new WS connection. Idempotent. */
  connect: () => void;
  /** Close the current WS connection. */
  disconnect: () => void;
  /**
   * Send an RpcCommand. Returns the parsed response from pi (or an
   * error if the bridge rejects / times out).
   */
  send: <T = unknown>(cmd: PiCommand) => Promise<T>;
}

/**
 * Loose-typed command shape — mirrors `@earendil-works/pi-coding-agent`'s
 * `RpcCommand` union but we don't import it (browser shouldn't pull
 * the Node-only SDK). Each command has at minimum `{ type: string }`;
 * the rest are command-specific fields the server will validate.
 */
export type PiCommand = {
  type: string;
  [k: string]: unknown;
};

export function usePiSession(opts?: {
  /** Auto-connect on mount. Defaults to false so callers decide. */
  autoConnect?: boolean;
}): PiSession {
  const [state, setState] = useState<PiConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  // v0.9.10: 0 when not reconnecting; 1..N while a
  // backoff timer is pending or in flight. The status
  // bar reads this to render "Reconnecting (3/5)…".
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [events, setEvents] = useState<PiStreamEvent[]>([]);

  interface PendingCommand {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }

  /**
   * Internal helper: cast a typed resolve to the loose-typed
   * PendingCommand.resolve. Safe because the call site wraps the
   * typed resolve inside a closure that adapts `T` → `unknown`.
   */
  function wrap<T>(
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void,
    timeoutId: ReturnType<typeof setTimeout>,
  ): PendingCommand {
    return {
      resolve: (v) => resolve(v as T),
      reject: (e: Error) => reject(e),
      timeoutId,
    };
  }

  const wsRef = useRef<WebSocket | null>(null);
  // Pending commands keyed by the unique id we attach to every
  // command. Server echoes the id back on the response so we can
  // match precisely (FIFO fallback for old bridges without id echo).
  const pendingRef = useRef<Map<string, PendingCommand>>(new Map());
  // v0.9.10: when the user clicks Disconnect (or the
  // component unmounts), we set this to true so the
  // onclose handler knows the drop is intentional and
  // should NOT trigger an auto-reconnect. Auto-reconnect
  // is for "the network / server blinked" — never for
  // "I clicked the button".
  const userInitiatedDisconnectRef = useRef(false);
  // v0.9.10: timer id for the pending backoff. We cancel
  // it on a successful reconnect, on a new connect(),
  // and on disconnect() so a stale timer never fires
  // after the user has moved on.
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v0.9.10: mirror of `reconnectAttempt` state.
  // onclose reads it synchronously (no setState
  // functional updater — those are forbidden inside
  // strict-mode dev because they can be invoked
  // twice). The state value still drives the UI;
  // this ref just lets the handler compute "next
  // attempt" without a round-trip through React.
  const reconnectAttemptRef = useRef(0);

  const connect = useCallback(async () => {
    if (wsRef.current) return;
    // v0.9.10: if we got here via a fresh user click on
    // Connect after auto-reconnect gave up, clear the
    // "gave up" state and reset the attempt counter.
    setReconnectAttempt(0);
    setState("fetching-token");
    setError(null);

    let token: string;
    try {
      const res = await fetch("/api/pi/token", { cache: "no-store" });
      if (!res.ok) throw new Error(`token fetch failed: ${res.status}`);
      const json = (await res.json()) as { token?: string };
      if (!json.token) throw new Error("token fetch: empty body");
      token = json.token;
    } catch (e) {
      setError((e as Error).message);
      setState("error");
      return;
    }

    const url = `${PILOT_WS_BASE}/api/pi/ws`;
    setState("connecting");
    const ws = new WebSocket(url, [`pilot-token-${token}`]);

    ws.onopen = () => {
      // v0.9.10: a successful open resets the attempt
      // counter. The status bar fades the
      // "reconnecting" line and goes back to the
      // steady "connected" state.
      setReconnectAttempt(0);
      setState("connected");
    };
    ws.onclose = (ev) => {
      wsRef.current = null;
      // Reject any in-flight commands and clear their timeouts.
      for (const [, pending] of pendingRef.current) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error(`socket closed (${ev.code} ${ev.reason})`));
      }
      pendingRef.current.clear();

      // v0.9.10: auto-reconnect. Two cases skip it:
      //   1. The user clicked Disconnect (their intent).
      //   2. We've already burned through
      //      RECONNECT_MAX_ATTEMPTS.
      // Otherwise schedule a backoff and let the
      // timer fire connect() again.
      if (userInitiatedDisconnectRef.current) {
        userInitiatedDisconnectRef.current = false;
        setState("disconnected");
        return;
      }
      // Read the current attempt count from a ref
      // rather than a state functional updater. The
      // functional updater form is forbidden in
      // strict-mode dev (it can be invoked twice
      // and would cause double-fires of the side
      // effects below). We advance the ref first,
      // then commit both state updates in a single
      // pass.
      const nextAttempt = reconnectAttemptRef.current + 1;
      reconnectAttemptRef.current = nextAttempt;
      setReconnectAttempt(nextAttempt);
      if (nextAttempt > RECONNECT_MAX_ATTEMPTS) {
        // v0.9.10: give up. We leave reconnectAttempt
        // pinned at the max value so the UI can show
        // "Reconnect failed — click Connect" instead
        // of hanging on "Reconnecting (6/5)".
        setState("error");
        setError("WebSocket reconnection failed after 5 attempts");
        return;
      }
      setState("reconnecting");
      // Clear any leftover timer (defensive — a stale
      // timer would mean two connect()s race).
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        void connect();
      }, RECONNECT_BACKOFFS_MS[nextAttempt - 1]);
    };
    ws.onerror = () => {
      setError("WebSocket error (see browser devtools)");
    };
    ws.onmessage = (ev) => {
      let msg: PiMessage;
      try {
        msg = JSON.parse(String(ev.data)) as PiMessage;
      } catch {
        return;
      }
      if (msg.kind === "event") {
        setEvents((prev) => [...prev, msg]);
      } else if (msg.kind === "response") {
        // P0#1 (v0.5.14.1): match pending by id FIRST. We tag every
        // send() with a unique id; the server echoes the id on its
        // response (see PiRpcBridge.dispatch). Falling back to FIFO
        // by command-type was unsafe: two concurrent commands of the
        // same type (e.g. `prompt` then `abort`) would deadlock —
        // the first response would resolve the second Promise.
        let pending:
          | { resolve: (v: unknown) => void; reject: (e: Error) => void }
          | undefined;
        if (msg.id && pendingRef.current.has(msg.id)) {
          pending = pendingRef.current.get(msg.id);
          pendingRef.current.delete(msg.id);
        } else {
          // No id (old bridge, or response from before v0.5.14.1):
          // fall back to FIFO by command-type. Safe as long as the
          // caller never issues two in-flight commands of the same
          // type without ids.
          for (const [k, v] of pendingRef.current) {
            if (k.startsWith(`${msg.command}:`)) {
              pending = v;
              pendingRef.current.delete(k);
              break;
            }
          }
        }
        if (!pending) return;
        if (msg.success) {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error));
        }
      }
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    // v0.9.10: set the user-intent flag BEFORE
    // closing so onclose sees it and skips reconnect.
    userInitiatedDisconnectRef.current = true;
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setReconnectAttempt(0);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setState("disconnected");
    }
  }, []);

  const send = useCallback(<T = unknown>(cmd: PiCommand): Promise<T> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) {
      return Promise.reject(new Error("not connected"));
    }
    // Unique request id — server echoes it back so we can match
    // responses precisely even with multiple in-flight commands of
    // the same type.
    const id = `${cmd.type}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tagged = { ...cmd, id };
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Fire-and-forget cleanup: remove from pending map and
        // reject. The promise rejection unblocks the caller's
        // try/catch chain so the UI can recover.
        if (pendingRef.current.delete(id)) {
          reject(new Error(`command timeout after ${COMMAND_TIMEOUT_MS}ms`));
        }
      }, COMMAND_TIMEOUT_MS);
      pendingRef.current.set(id, wrap<T>(resolve, reject, timeoutId));
      try {
        ws.send(JSON.stringify(tagged));
      } catch (e) {
        clearTimeout(timeoutId);
        pendingRef.current.delete(id);
        reject(e as Error);
      }
    });
  }, []);

  useEffect(() => {
    if (opts?.autoConnect) {
      void connect();
    }
    return () => {
      disconnect();
    };
    // We intentionally omit connect/disconnect from deps — they're
    // stable (useCallback with [] deps) and including them would
    // cause re-runs on every render in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.autoConnect]);

  // v0.9.10: keep reconnectAttemptRef in sync with
  // the state value. The ref is the synchronous
  // source-of-truth for the next-attempt computation
  // in onclose; the state is the source-of-truth for
  // the UI.
  useEffect(() => {
    reconnectAttemptRef.current = reconnectAttempt;
  }, [reconnectAttempt]);

  return useMemo(
    () => ({
      state,
      error,
      reconnectAttempt,
      events,
      connect,
      disconnect,
      send,
    }),
    [state, error, reconnectAttempt, events, connect, disconnect, send],
  );
}

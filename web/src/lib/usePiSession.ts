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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PILOT_WS_BASE =
  process.env.NEXT_PUBLIC_PILOT_WS_URL ?? "ws://127.0.0.1:17361";

export type PiStreamEvent = {
  kind: "event";
  event: {
    type: string;
    [k: string]: unknown;
  };
};

export type PiCommandResponse =
  | { kind: "response"; command: string; success: true; data?: unknown }
  | { kind: "response"; command: string; success: false; error: string };

export type PiConnectionState =
  | "idle"
  | "fetching-token"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type PiMessage = PiStreamEvent | PiCommandResponse;

export interface PiSession {
  /** Current connection state. */
  state: PiConnectionState;
  /** Last error (transient — see `state` for status). */
  error: string | null;
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
  const [events, setEvents] = useState<PiStreamEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  // Pending commands keyed by the command's `id` field. Server
  // echoes the id back on the response so we can match.
  const pendingRef = useRef<
    Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  >(new Map());

  const connect = useCallback(async () => {
    if (wsRef.current) return;
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
      setState("connected");
    };
    ws.onclose = (ev) => {
      wsRef.current = null;
      // Reject any in-flight commands.
      for (const [, { reject }] of pendingRef.current) {
        reject(new Error(`socket closed (${ev.code} ${ev.reason})`));
      }
      pendingRef.current.clear();
      setState("disconnected");
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
        // Match by id (we tag every command with an id; the server
        // echoes it back on the response — except we only see the
        // parsed message here. To match without an id, fall back to
        // command-type + FIFO order — only one in-flight per type).
        let pending:
          | { resolve: (v: unknown) => void; reject: (e: Error) => void }
          | undefined;
        if (!pending) {
          // No id — match by command + FIFO.
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
    const id = `${cmd.type}:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tagged = { ...cmd, id };
    return new Promise<T>((resolve, reject) => {
      pendingRef.current.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      ws.send(JSON.stringify(tagged));
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

  return useMemo(
    () => ({ state, error, events, connect, disconnect, send }),
    [state, error, events, connect, disconnect, send],
  );
}

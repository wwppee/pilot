/**
 * Unit tests for the v0.5.14+ WebSocket pi RPC bridge.
 *
 * These exercise the bridge's pure logic (command dispatch + JSON
 * envelope shape) without actually spawning a WebSocket or a
 * pi subprocess. We fake the socket (capture `send()` calls) and
 * the RpcClient (replace the bridge's `rpc` field with a stub).
 */
import { describe, it, expect, vi } from "vitest";
import { PiRpcBridge } from "../../src/server/pi-rpc-bridge.js";
import type { RpcClient } from "@earendil-works/pi-coding-agent";
import type { WebSocket } from "ws";

/**
 * Minimal fake of a `ws.WebSocket` that captures every JSON payload
 * we hand to `socket.send(...)` AND every listener the bridge (or
 * anyone else) registers via `socket.on(event, cb)`. We don't model
 * state transitions — PiRpcBridge only reads `OPEN` / sends — so
 * this is enough for the bridge's surface.
 */
function fakeSocket() {
  const sent: object[] = [];
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const socket = {
    OPEN: 1,
    CLOSED: 3,
    readyState: 1,
    send: (data: string) => {
      sent.push(JSON.parse(data));
    },
    close: () => {
      // no-op; the bridge tracks state via its own `closed` flag.
    },
    on: (ev: string, cb: (...args: unknown[]) => void) => {
      (listeners[ev] ??= []).push(cb);
    },
    once: () => {},
  } as unknown as WebSocket;

  return {
    socket,
    sent,
    listeners,
    /** Fire the first registered "message" listener with a JSON-encoded payload. */
    triggerMessage: async (msg: unknown) => {
      const ls = listeners.message ?? [];
      for (const cb of ls)
        await cb(typeof msg === "string" ? msg : JSON.stringify(msg));
    },
  };
}

/**
 * Build a bridge pre-loaded with a stub RpcClient. The bridge's
 * constructor registers the message listener synchronously, so by
 * the time we return, the listener is in place and any `triggerMessage`
 * call will route through the stub.
 */
async function bridgeWithStubbedRpc(opts?: {
  responses?: Map<string, () => Promise<unknown>>;
}) {
  const fake = fakeSocket();
  const bridge = new PiRpcBridge(fake.socket);
  const stub = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop !== "string") return undefined;
        const fn = opts?.responses?.get(prop);
        return fn ? () => fn() : () => Promise.resolve(undefined);
      },
    },
  );
  // Reach into the bridge's private `rpc` field via a structural cast
  // so we can swap in a stub without disabling the `no-explicit-any`
  // rule (which `--max-warnings 0` lint config treats as a problem
  // when the disable directive is unused).
  (bridge as unknown as { rpc: RpcClient }).rpc = stub;
  return { bridge, fake, stub };
}

describe("PiRpcBridge (v0.5.14.1)", () => {
  it("echoes the request id in success responses (P0#1)", async () => {
    const { fake } = await bridgeWithStubbedRpc();
    await fake.triggerMessage({ type: "get_state", id: "req_42" });
    const responses = fake.sent.filter(
      (
        m,
      ): m is {
        kind: "response";
        command: string;
        id?: string;
        success: boolean;
      } => (m as { kind: string }).kind === "response",
    );
    expect(responses.length).toBeGreaterThan(0);
    expect(responses[0]!.command).toBe("get_state");
    expect(responses[0]!.id).toBe("req_42");
    expect(responses[0]!.success).toBe(true);
  });

  it("responds with success=false for unknown command types (P1#3)", async () => {
    const { fake } = await bridgeWithStubbedRpc();
    await fake.triggerMessage({ type: "fake_command_xyz", id: "req_99" });
    const errors = fake.sent.filter(
      (m): m is { kind: "response"; success: boolean; error?: string } =>
        (m as { kind: string }).kind === "response",
    );
    expect(
      errors.some(
        (e) => e.success === false && e.error?.includes("fake_command_xyz"),
      ),
    ).toBe(true);
  });

  it("returns success=false with 'not JSON' for malformed input (P1#5 Buffer-safe)", async () => {
    const fake = fakeSocket();
    const bridge = new PiRpcBridge(fake.socket);
    (bridge as unknown as { rpc: RpcClient }).rpc = {} as RpcClient;
    // Bypass JSON.stringify — we want the raw malformed string.
    await fake.listeners.message[0]?.("{not json");
    const errors = fake.sent.filter(
      (m): m is { kind: "response"; success: boolean; error?: string } =>
        (m as { kind: string }).kind === "response",
    );
    expect(errors[0]?.success).toBe(false);
    expect(errors[0]?.error).toContain("not JSON");
  });

  it("decodes Buffer payloads (P1#5 Buffer-safe)", async () => {
    const { fake } = await bridgeWithStubbedRpc();
    // Hand the listener a Buffer instead of a string. The bridge
    // should decode it via Buffer.toString("utf-8") and parse the
    // embedded JSON.
    await fake.listeners.message[0]?.(
      Buffer.from('{"type":"get_state","id":"buf_1"}', "utf-8"),
    );
    const responses = fake.sent.filter(
      (m): m is { kind: "response"; command: string; id?: string } =>
        (m as { kind: string }).kind === "response",
    );
    expect(responses[0]?.command).toBe("get_state");
    expect(responses[0]?.id).toBe("buf_1");
  });

  it("close() is idempotent", async () => {
    const fake = fakeSocket();
    const bridge = new PiRpcBridge(fake.socket);
    (bridge as unknown as { rpc: RpcClient }).rpc = {
      stop: vi.fn(() => Promise.resolve()),
    } as unknown as RpcClient;
    await bridge.close();
    await bridge.close();
    expect((bridge as unknown as { closed: boolean }).closed).toBe(true);
  });
});

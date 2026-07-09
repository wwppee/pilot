/**
 * usePiSession tests — verify id-based pending Promise matching.
 *
 * v0.5.14.1 P0#1 fix: the v0.5.14 hook only matched responses to
 * pending Promises by FIFO on command-type. Two concurrent commands
 * of the same type (e.g. `prompt` followed by `abort`) would
 * deadlock because the first response would resolve the second
 * Promise. The fix tags every `send()` with a unique id and looks
 * up the response by id.
 *
 * We exercise the hook via a tiny harness component so we can drive
 * the fake WebSocket from the test (jsdom doesn't ship a working
 * WebSocket server).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { useEffect, useRef } from "react";

import { usePiSession, type PiSession } from "../src/lib/usePiSession";

interface FakeSocket {
  sent: string[];
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  readyState: number;
  OPEN: number;
  close: () => void;
  send: (data: string) => void;
  /** Test helper: fire a fake server message. */
  receive: (json: object) => void;
  /** Test helper: fire the open event. */
  open: () => void;
}

let lastSocket: FakeSocket | null = null;

class MockWebSocket {
  static OPEN = 1;
  OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor(_url: string, _protocols?: string | string[]) {
    lastSocket = this as unknown as FakeSocket;
    lastSocket.receive = (json) => {
      if (this.onmessage)
        this.onmessage({ data: JSON.stringify(json) } as MessageEvent);
    };
    lastSocket.open = () => {
      this.readyState = 1;
      if (this.onopen) this.onopen({} as Event);
    };
    lastSocket.close = () => {
      this.readyState = 3;
      if (this.onclose) this.onclose({} as CloseEvent);
    };
  }
  send(data: string) {
    this.sent.push(data);
  }
}

// jsdom doesn't provide WebSocket — install the mock before usePiSession
// tries to `new WebSocket(...)`.
beforeEach(() => {
  lastSocket = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = MockWebSocket;
  // fetch returns a token so connect() proceeds to WS open.
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ token: "test-token" }),
      }),
    ),
  );
});

function SessionHarness({ onReady }: { onReady: (s: PiSession) => void }) {
  const session = usePiSession({ autoConnect: true });
  const handed = useRef(false);
  useEffect(() => {
    if (session.state === "connected" && !handed.current) {
      handed.current = true;
      onReady(session);
    }
  }, [session, onReady]);
  return null;
}

async function connectHarness(): Promise<{
  session: PiSession;
  socket: FakeSocket;
}> {
  let captured: PiSession | null = null;
  const onReady = (s: PiSession) => {
    captured = s;
  };
  render(<SessionHarness onReady={onReady} />);
  // Let connect() resolve the fetch + construct the WS, then open it.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    lastSocket?.open();
    await Promise.resolve();
  });
  if (!captured || !lastSocket) throw new Error("harness did not connect");
  return { session: captured, socket: lastSocket };
}

describe("usePiSession — P0#1 id matching", () => {
  it("matches response by id when two prompts are in flight (P0#1)", async () => {
    const { session, socket } = await connectHarness();

    // Fire two prompts without awaiting. Each gets a unique id we
    // can pluck from the JSON we sent on the wire.
    const p1 = session.send({ type: "prompt", message: "first" });
    const p2 = session.send({ type: "prompt", message: "second" });
    expect(socket.sent).toHaveLength(2);

    const sent1 = JSON.parse(socket.sent[0]!) as {
      id: string;
      message: string;
    };
    const sent2 = JSON.parse(socket.sent[1]!) as {
      id: string;
      message: string;
    };
    expect(sent1.id).toBeTruthy();
    expect(sent2.id).toBeTruthy();
    expect(sent1.id).not.toEqual(sent2.id);

    // Resolve the SECOND prompt's response first. Without id matching,
    // the FIFO-by-type logic would resolve p1 with the wrong data.
    socket.receive({
      kind: "response",
      command: "prompt",
      success: true,
      id: sent2.id,
      data: { reply: "second-reply" },
    });
    // Then resolve the FIRST prompt.
    socket.receive({
      kind: "response",
      command: "prompt",
      success: true,
      id: sent1.id,
      data: { reply: "first-reply" },
    });

    const r1 = await p1;
    const r2 = await p2;
    expect((r1 as { reply: string }).reply).toBe("first-reply");
    expect((r2 as { reply: string }).reply).toBe("second-reply");
  });

  it("falls back to FIFO by command-type when response has no id", async () => {
    const { session, socket } = await connectHarness();
    const p = session.send({ type: "get_state" });
    expect(socket.sent).toHaveLength(1);
    // Old bridge scenario: server echoes NO id on the response.
    socket.receive({
      kind: "response",
      command: "get_state",
      success: true,
      data: { model: "claude-opus-4" },
    });
    const r = (await p) as { model: string };
    expect(r.model).toBe("claude-opus-4");
  });

  it("rejects pending on error response", async () => {
    const { session, socket } = await connectHarness();
    const sent = socket.sent;
    const p = session.send({ type: "prompt", message: "boom" });
    const sent1 = JSON.parse(sent[0]!) as { id: string };
    socket.receive({
      kind: "response",
      command: "prompt",
      success: false,
      id: sent1.id,
      error: "rate limited",
    });
    await expect(p).rejects.toThrow(/rate limited/);
  });

  it("times out a hung pending command after 30s", async () => {
    // We don't actually wait 30s — instead override setTimeout via
    // vi.useFakeTimers and advance.
    vi.useFakeTimers();
    try {
      const { session, socket } = await connectHarness();
      const p = session.send({ type: "prompt", message: "slow" });
      // Reject unhandled rejection once we advance the timer.
      const rejection = expect(p).rejects.toThrow(/timeout/);
      vi.advanceTimersByTime(30_001);
      await rejection;
      // Sanity: socket saw the command, but no response arrived.
      expect(socket.sent).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

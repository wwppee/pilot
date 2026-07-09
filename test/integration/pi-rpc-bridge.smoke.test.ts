/**
 * Smoke test for the v0.5.14+ WebSocket pi RPC bridge.
 *
 * Runs against a live `pilot server` on 127.0.0.1:17361. Skipped
 * by `npm run test:offline` because it requires a real server.
 *
 * Why a smoke test and not a unit test: the bridge depends on
 * (1) the Fastify WebSocket plugin, (2) a live `pi` binary on
 * PATH, (3) a real auth token from the server's token file.
 * Mocking all three would test the mocks more than the bridge.
 *
 * The test:
 *   1. Reads the auth token from ~/.pilot/server.token
 *   2. Connects a ws client with subprotocols ["pilot-token", "<tok>"]
 *   3. Sends a `get_state` RpcCommand
 *   4. Expects an event/response within 5 seconds
 *   5. Closes the connection cleanly
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import WebSocket from "ws";

const SERVER = "ws://127.0.0.1:17361/api/pi/ws";
const TOKEN_PATH = join(homedir(), ".pilot", "server.token");

const shouldRun = process.env.PILOT_SKIP_NETWORK !== "1";

describe.skipIf(!shouldRun)("pi RPC bridge (v0.5.14+ smoke)", () => {
  let token: string;

  beforeAll(() => {
    token = readFileSync(TOKEN_PATH, "utf-8").trim();
  });

  it("rejects connections with a bad token", async () => {
    const ws = new WebSocket(SERVER, ["pilot-token", "wrong-token"]);
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on("close", (code, reason) =>
        resolve({ code, reason: reason.toString() }),
      );
    });
    const { code, reason } = await closed;
    expect(code).toBe(1008); // policy violation
    expect(reason).toContain("unauthorized");
  });

  it("accepts a valid token and responds to get_state", async () => {
    const ws = new WebSocket(SERVER, ["pilot-token-" + token]);
    const events: unknown[] = [];
    const opened = new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });
    await opened;

    const gotResponse = new Promise<{
      kind: string;
      command: string;
      success: boolean;
      data?: unknown;
    }>((resolve) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(String(raw));
        events.push(msg);
        if (msg.kind === "response" && msg.command === "get_state") {
          resolve(msg);
        }
      });
    });

    ws.send(JSON.stringify({ id: "1", type: "get_state" }));

    const response = await Promise.race([
      gotResponse,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("no response within 8s")), 8000),
      ),
    ]);
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
    // State has the canonical fields — model + thinkingLevel + isStreaming.
    const data = response.data as Record<string, unknown>;
    expect(data.model).toBeDefined();
    expect(data.thinkingLevel).toBeDefined();

    ws.close();
  });
});

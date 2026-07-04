/**
 * net.test.ts — coverage for src/utils/net.ts.
 *
 * `isPortOpen` is exercised against a real in-process TCP server
 * (no mocking — Node's net primitives are cheap and stable).
 *
 * `pidListeningOnPort` / `processCommandLine` / `looksLikePilotProcess` /
 * `killProcessTree` / `waitForPortFree` are mostly platform-dependent
 * — we test the pure helpers and assert graceful behavior on the
 * "can't introspect" path (returns null / empty).
 */

import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:net";
import {
  isPortOpen,
  looksLikePilotProcess,
  pidListeningOnPort,
  processCommandLine,
} from "../../src/utils/net.js";

/** Spin up a listening TCP server on a random port; return its port + close fn. */
async function withOpenPort(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const srv: Server = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("could not read bound port"));
        return;
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((res) => {
            srv.close(() => res());
          }),
      });
    });
  });
}

describe("isPortOpen", () => {
  it("returns true for a listening port", async () => {
    const { port, close } = await withOpenPort();
    try {
      expect(await isPortOpen("127.0.0.1", port)).toBe(true);
    } finally {
      await close();
    }
  });

  it("returns false for a closed port (no listener)", async () => {
    // Pick a port that is *very* likely closed. We use a high
    // random port the test runner just released — race-condition
    // safe enough for offline tests.
    const { port, close } = await withOpenPort();
    await close();
    expect(await isPortOpen("127.0.0.1", port)).toBe(false);
  });
});

describe("looksLikePilotProcess", () => {
  it.each([
    ["pilot dashboard", true],
    ["pilot server", true],
    ["node /Users/x/pilot/dist/cli.js dashboard", true],
    ["node_modules/pilot/dist/cli.js server --port 17361", true],
    ["/abs/path/node_modules/.bin/pilot server", true],
    ["next-server (v16.2.9)", true],
    ["next dev --port 17371", true],
    ["node /home/me/proj/node_modules/.bin/pilot dashboard --no-open", true],
    ["code --type=renderer", false],
    ["/Applications/Firefox.app/Contents/MacOS/firefox", false],
    ["/usr/bin/python3 /tmp/my-script.py", false],
    ["", false],
  ])("cmdline=%s → %s", (cmdline, expected) => {
    expect(looksLikePilotProcess(cmdline)).toBe(expected);
  });
});

describe("pidListeningOnPort", () => {
  it("returns the PID of our test server", async () => {
    const { port, close } = await withOpenPort();
    try {
      const pids = await pidListeningOnPort(port);
      expect(pids.length).toBeGreaterThan(0);
      expect(pids[0]).toBe(process.pid);
    } finally {
      await close();
    }
  });

  it("returns [] when nothing is listening", async () => {
    const { port, close } = await withOpenPort();
    await close();
    const pids = await pidListeningOnPort(port);
    expect(pids).toEqual([]);
  });
});

describe("processCommandLine", () => {
  it("returns our own argv for process.pid", async () => {
    const cmd = await processCommandLine(process.pid);
    // vitest runs our test as `node ...`. The cmdline should
    // mention vitest or our test runner somewhere.
    expect(cmd).not.toBeNull();
    expect(cmd!.length).toBeGreaterThan(0);
  });

  it("returns null for a non-existent PID", async () => {
    // Pick a PID that's very unlikely to exist (max int - 1).
    const cmd = await processCommandLine(2_147_483_646);
    expect(cmd).toBeNull();
  });
});

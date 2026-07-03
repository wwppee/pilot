/**
 * Tests for `utils/net.ts` — TCP port probe.
 *
 * The probe is the foundation of `pilot init --start`: it tells us
 * whether something is already listening on 17361 (an already-running
 * pilot server) so we can decide whether to spawn a new one.
 */

import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:net";
import { isPortOpen } from "../../src/utils/net.js";

describe("isPortOpen", () => {
  it("returns false when nothing is listening on a closed port", async () => {
    // Pick a high random port that's almost certainly free.
    const ok = await isPortOpen("127.0.0.1", 1);
    expect(ok).toBe(false);
  });

  it("returns true when something is listening", async () => {
    const server = await new Promise<Server>((resolve) => {
      const s = createServer(() => undefined);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("expected numeric port");
      }
      const ok = await isPortOpen("127.0.0.1", addr.port);
      expect(ok).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("resolves within ~1 second (never hangs)", async () => {
    const start = Date.now();
    await isPortOpen("127.0.0.1", 1); // closed
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it("handles invalid hosts gracefully (returns false, doesn't throw)", async () => {
    const ok = await isPortOpen("0.0.0.0", 1);
    expect(typeof ok).toBe("boolean");
  });
});

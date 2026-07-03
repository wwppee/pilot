/**
 * Tiny network utilities used by commands.
 *
 * Avoid pulling in `node:net`'s heavyweight APIs when we only need
 * "is anything listening on host:port?". We do a non-blocking TCP
 * connect attempt and resolve on success / ECONNREFUSED, reject
 * on timeout.
 */

import { createConnection } from "node:net";
import type { Socket } from "node:net";

/**
 * Probe a TCP port. Returns true if something is listening.
 * Resolves false on ECONNREFUSED, ETIMEDOUT, or any other error.
 *
 * Race against a 1s timeout — never hangs.
 */
export function isPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolveP) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolveP(ok);
    };
    let sock: Socket;
    try {
      sock = createConnection({ host, port });
    } catch {
      finish(false);
      return;
    }
    sock.once("connect", () => {
      sock.destroy();
      finish(true);
    });
    sock.once("error", () => {
      sock.destroy();
      finish(false);
    });
    setTimeout(() => {
      sock.destroy();
      finish(false);
    }, 1_000);
  });
}

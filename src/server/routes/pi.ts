/**
 * v0.9.16: /api/pi/ws (WebSocket) route extracted
 * from server.ts.
 *
 *   - GET /api/pi/ws  — WebSocket upgrade
 *
 * Browser → WebSocket → Pilot server → RpcClient →
 * `pi --mode rpc`. The browser speaks pi's JSON-lines
 * RPC protocol directly via `usePiSession()` (see
 * web/src/lib/usePiSession.ts). One bridge instance
 * per connection; pi is spawned fresh per connection.
 *
 * Auth: client must include `pilot-token` as a
 * subprotocol, e.g.
 *   new WebSocket(url, ["pilot-token-<TOKEN>"])
 * The `socket.protocol` after handshake reads back
 * as the single subprotocol name the server
 * negotiated — we strip the prefix to verify.
 * Browsers can't add custom headers to WebSocket, so
 * subprotocol is the only way to authenticate
 * without a query string (which would leak into
 * logs).
 *
 * P1#4: every live bridge is tracked in
 * `liveBridges` (a Set the caller passes in) so
 * `app.close()` (server shutdown / test teardown)
 * can stop the spawned pi subprocesses explicitly.
 * Without this, pi children outlive the server and
 * leak as orphans. The onClose hook at the bottom
 * of this module is the counterpart that drains
 * the set on shutdown.
 */
import type { FastifyInstance } from "fastify";
import { verifyToken } from "../auth.js";
import { PiRpcBridge } from "../pi-rpc-bridge.js";

export interface PiRouteDeps {
  /** Server's auth token, used to verify the WS subprotocol. */
  token: string;
  /** Set of live pi bridges — the caller owns it; this
   *  module only adds/removes. Passed in so the onClose
   *  hook (registered here) can drain the set on
   *  server shutdown. */
  liveBridges: Set<PiRpcBridge>;
}

export function registerPiRoutes(
  app: FastifyInstance,
  deps: PiRouteDeps,
): void {
  const { token, liveBridges } = deps;

  app.get("/api/pi/ws", { websocket: true }, (socket /* _req */) => {
    // @fastify/websocket passes the WebSocket directly. After
    // the handshake `socket.protocol` is the single subprotocol
    // name the server negotiated — we expect a token-as-name
    // pattern: client passes `["pilot-token-<TOKEN>"]` and we
    // strip the prefix to verify. Browsers can't add custom
    // headers to WebSocket, so subprotocol is the only way to
    // authenticate without a query string (which would leak
    // into logs).
    const proto = String(socket.protocol ?? "");
    const prefix = "pilot-token-";
    const presentedToken = proto.startsWith(prefix)
      ? proto.slice(prefix.length)
      : "";
    if (!presentedToken || !verifyToken(presentedToken, token)) {
      socket.close(1008, "unauthorized");
      return;
    }

    const bridge = new PiRpcBridge(socket);
    liveBridges.add(bridge);
    // Use `.on()` rather than `.once()` for portability — the
    // `ws.WebSocket` type from `@types/ws@8` doesn't always declare
    // `.once()`, and `socket.on("close", cb)` is functionally
    // equivalent here (the socket is already closed by the time the
    // callback runs, so it won't fire again).
    socket.on("close", () => {
      liveBridges.delete(bridge);
    });

    const cwd = process.env.HOME ?? process.cwd();
    void bridge.start(cwd).catch((e: Error) => {
      app.log.error(e, "pi rpc bridge failed to start");
    });
  });

  // Stop every live pi subprocess on server shutdown. Without this
  // hook, app.close() tears down the HTTP socket but the RpcClient-
  // spawned pi processes keep running with no parent coordination.
  app.addHook("onClose", async () => {
    await Promise.all(
      Array.from(liveBridges).map((b) =>
        b.close().catch(() => {
          // Best-effort — log and move on.
        }),
      ),
    );
    liveBridges.clear();
  });
}

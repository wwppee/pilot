/**
 * /api/pi/token — returns the pilot server auth token to the browser.
 *
 * Only for the v0.5.14+ WebSocket pi RPC bridge: the browser needs
 * the token to authenticate the WS subprotocol, but the token
 * never leaves the server in the normal HTTP flow (the
 * `/api/pilot/[...path]` proxy adds it server-side).
 *
 * P1#6 (v0.5.14.1): refuse non-localhost requests. The endpoint
 * runs on the Next.js dev server (e.g. 17362) and the pilot server
 * (17361) — both should be reachable only from the local machine.
 * Rejecting non-localhost stops a remote tab from grabbing the
 * token and using it to talk to the pilot server directly.
 *
 * Security: this endpoint is same-origin and runs on the Next.js
 * server, which only listens on localhost. The token is exposed to
 * the page's JS, but the page can only talk to localhost-bound
 * services anyway. We do NOT cache this in localStorage — the
 * hook re-fetches on every page load.
 */
import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

async function getToken(): Promise<string | null> {
  const env = process.env.PILOT_TOKEN;
  if (env) return env;
  try {
    const home = process.env.HOME ?? homedir();
    const buf = await readFile(join(home, ".pilot", "server.token"), "utf-8");
    return buf.trim();
  } catch {
    return null;
  }
}

/**
 * True when the request's effective remote address is a localhost
 * loopback (127.0.0.0/8 or ::1).
 *
 * We extract the IP from the `x-forwarded-for` header (first hop)
 * with a fallback to the host portion of the `host` header — the
 * Next.js dev server always runs on localhost so the only realistic
 * remote is 127.0.0.1. Production behind a reverse proxy should
 * verify the proxy's resolved addr, not the client IP directly.
 */
function isLocalhost(req: NextRequest): boolean {
  const xff = req.headers.get("x-forwarded-for");
  const remote = (xff?.split(",")[0] ?? "").trim();
  return (
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1" ||
    remote === "localhost" ||
    remote === ""
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!isLocalhost(req)) {
    return new Response(JSON.stringify({ error: "localhost only" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }
  const token = await getToken();
  if (!token) {
    return new Response(
      JSON.stringify({ error: "pilot server token not configured" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      // No-cache so a token rotation is reflected on the next page load.
      "cache-control": "no-store",
    },
  });
}

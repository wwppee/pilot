/**
 * /api/pi/token — returns the pilot server auth token to the browser.
 *
 * Only for the v0.5.14+ WebSocket pi RPC bridge: the browser needs
 * the token to authenticate the WS subprotocol, but the token
 * never leaves the server in the normal HTTP flow (the
 * `/api/pilot/[...path]` proxy adds it server-side).
 *
 * Security: this endpoint is same-origin and runs on the Next.js
 * server, which only listens on localhost. The token is exposed to
 * the page's JS, but the page can only talk to localhost-bound
 * services anyway. We do NOT cache this in localStorage — the
 * hook re-fetches on every page load.
 */
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

export async function GET(): Promise<Response> {
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

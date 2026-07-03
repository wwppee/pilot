/**
 * Catch-all proxy: /api/pilot/[...path] → http://127.0.0.1:17361/[...path]
 *
 * v0.4.7: enables browser-side `browserApi` calls without leaking the
 * pilot token. The Next.js server reads the token from
 * `~/.pilot/server.token` (server-side only — never sent to the
 * browser) and forwards the request to the pilot server.
 *
 * Why not just `next.config.ts` rewrites?
 *   - `rewrites()` work for GET in production, but Next.js doesn't
 *     reliably forward POST bodies / method / custom headers
 *   - Custom headers like `x-pilot-csrf` aren't easy to inject from
 *     a rewrite rule
 *   - With a route handler, we have full control of the request and
 *     can add the token transparently
 *
 * Trade-off: extra latency (~1ms per request) and a node-side
 * hop, in exchange for clean browser-side code and proper token
 * isolation.
 */

import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PILOT_SERVER = process.env.PILOT_SERVER_URL ?? "http://127.0.0.1:17361";

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

async function getCsrfToken(): Promise<string | null> {
  // The pilot server emits a fresh csrf on every /health GET.
  // We cache per process to avoid the round-trip on every request.
  const now = Date.now();
  if (csrfCache.value && now - csrfCache.at < 60_000) return csrfCache.value;
  try {
    const res = await fetch(`${PILOT_SERVER}/health`, { cache: "no-store" });
    const csrf = res.headers.get("x-pilot-csrf");
    if (csrf) {
      csrfCache.value = csrf;
      csrfCache.at = now;
      return csrf;
    }
  } catch {
    /* fall through */
  }
  return null;
}

const csrfCache: { value: string | null; at: number } = { value: null, at: 0 };

// Mutating methods need CSRF (server enforces double-submit). Reads don't.
const MUTATING = new Set(["POST", "PUT", "DELETE", "PATCH"]);

export async function proxyHandler(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const url = `${PILOT_SERVER}/${path.join("/")}`;
  const token = await getToken();

  const headers = new Headers();
  // Pass-through of useful request headers
  for (const [k, v] of req.headers.entries()) {
    if (
      k.toLowerCase() === "host" ||
      k.toLowerCase() === "content-length" ||
      k.toLowerCase() === "connection"
    ) {
      continue;
    }
    headers.set(k, v);
  }
  if (token) headers.set("x-pilot-token", token);

  if (MUTATING.has(req.method)) {
    const csrf = await getCsrfToken();
    if (csrf) headers.set("x-pilot-csrf", csrf);
  }

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
    // Content-Length is now known; let fetch re-add it.
    headers.delete("content-length");
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `pilot server unreachable: ${(err as Error).message}`,
      }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // Pass through response body + status, but strip hop-by-hop headers.
  const respHeaders = new Headers(upstream.headers);
  for (const h of [
    "connection",
    "keep-alive",
    "transfer-encoding",
    "set-cookie", // we never set cookies on this proxy
  ]) {
    respHeaders.delete(h);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const DELETE = proxyHandler;
export const PATCH = proxyHandler;

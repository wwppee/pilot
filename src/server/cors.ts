/**
 * v0.9.16: CORS origin allowlist helper extracted
 * from server.ts.
 *
 * Pure function (no Fastify / no side effects) so
 * the auth hook can be unit-tested in isolation if
 * a future change ever needs it.
 *
 * The set covers:
 *   - the listen host (default 127.0.0.1)
 *   - the loopback aliases (localhost)
 *
 * Any browser request with a different Origin
 * header is rejected with 403 before the route
 * handler runs. This blocks cross-site CSRF
 * attempts that could otherwise ride the
 * X-Pilot-Token auth (which is sent in a
 * non-HttpOnly header).
 */
export function allowedOriginsFor(host: string, port: number): Set<string> {
  const origins = new Set<string>();
  const variants =
    host === "127.0.0.1" || host === "0.0.0.0" ? [host, "localhost"] : [host];
  for (const h of variants) {
    origins.add(`http://${h}:${port}`);
  }
  return origins;
}

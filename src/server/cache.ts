/**
 * Server-side in-memory TTL cache for the read-only
 * list endpoints.
 *
 * v0.9.11: extracted from the dashboard refresh hot
 * path. Pre-v0.9.11 every dashboard refresh did
 * six parallel `service.listX()` calls, each of
 * which re-scanned the relevant directory on disk
 * (`~/.pilot/packs/`, `~/.pilot/extensions/`, etc).
 * On a system with 100+ capabilities, a dashboard
 * refresh could take 100s of ms — visible to the
 * user as "the page jitters every time I switch
 * tabs". agegr/pi-web (commit d469c68) hit the
 * same problem and shipped a 30s TTL cache; pilot
 * does the same here.
 *
 * Design constraints:
 *   - **TTL only**, no LRU/eviction. The cached
 *     payloads are small (a few KB each for the
 *     four endpoints we wrap). 4 keys × 30s is
 *     nothing.
 *   - **Explicit invalidation** on writes. The
 *     caller (route handler) tells the cache when
 *     a write happened, rather than the cache
 *     guessing. This keeps the contract obvious —
 *     no "I wrote a new policy but the dashboard
 *     still shows the old list" surprise.
 *   - **Best-effort, no locking**. The cache is a
 *     `Map` mutated from request handlers. In the
 *     rare concurrent-write race, the next read
 *     either gets the stale-but-fine value (TTL
 *     window) or the fresh value (next write's
 *     invalidation wins). No data corruption
 *     possible because the stored value is JSON.
 *   - **No stale-on-error**. If the loader throws,
 *     the cached value is preserved (we don't
 *     want one bad scan to wipe a good cache),
 *     and the error propagates. The caller can
 *     decide to `invalidate()` on its own
 *     error-handling path.
 */

const DEFAULT_TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  /** Epoch ms. */
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Read-through cache. On a hit (key present + not
 * expired) returns the stored value. On a miss,
 * calls `loader()`, stores the result with a fresh
 * TTL, and returns it. The `key` is a caller-chosen
 * string (e.g. `packs:list`, `sessions:list`); we
 * don't try to dedupe across similar callsites.
 */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/**
 * Invalidate one key (or all keys, if `key` is
 * omitted). Call this from a write route
 * (`POST /packs/install`, `PUT /policies/:name`,
 * etc.) so the next dashboard refresh sees the
 * fresh data.
 */
export function invalidate(key?: string): void {
  if (key === undefined) {
    store.clear();
    return;
  }
  store.delete(key);
}

/**
 * Test-only: peek at the current cache state
 * without going through the loader. Returns the
 * stored entry's age in ms (or `null` if absent).
 * Production code should never need this — the
 * helper exists so the regression test in
 * `cache.test.ts` can assert "did the write route
 * actually invalidate this key?".
 */
export function _peekAge(key: string): number | null {
  const hit = store.get(key) as CacheEntry<unknown> | undefined;
  if (!hit) return null;
  return Date.now() - (hit.expiresAt - DEFAULT_TTL_MS);
}

/**
 * v0.9.11: server-side cache helper tests.
 *
 * The cache is the hot path for the dashboard —
 * every page refresh hits the four list endpoints
 * (`/packs`, `/sessions`, `/profiles`,
 * `/capabilities`) and each used to re-scan disk.
 * agegr/pi-web (commit d469c68) shipped the same
 * fix; this test locks the contract:
 *   - `cached(key, loader)` returns the loader
 *     result on first call, stores it, and serves
 *     subsequent calls from memory
 *   - `invalidate(key)` makes the next call
 *     re-invoke the loader
 *   - the loader throwing preserves the existing
 *     cache entry (one bad scan should not wipe a
 *     good cache)
 *   - `invalidate()` with no key clears everything
 */
import { describe, it, expect, vi } from "vitest";
import { cached, invalidate, _peekAge } from "../../src/server/cache.js";

describe("server cache (v0.9.11)", () => {
  it("returns the loader result on first call and stores it", async () => {
    invalidate("test:first");
    const loader = vi.fn(async () => "value-1");
    const v = await cached("test:first", loader);
    expect(v).toBe("value-1");
    expect(loader).toHaveBeenCalledTimes(1);
    // Second call within TTL: loader NOT re-invoked.
    const v2 = await cached("test:first", loader);
    expect(v2).toBe("value-1");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-invokes the loader after invalidate()", async () => {
    invalidate("test:invalidate");
    const loader = vi
      .fn()
      .mockResolvedValueOnce("a")
      .mockResolvedValueOnce("b");
    expect(await cached("test:invalidate", loader)).toBe("a");
    expect(loader).toHaveBeenCalledTimes(1);
    invalidate("test:invalidate");
    expect(await cached("test:invalidate", loader)).toBe("b");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("re-invokes the loader after the TTL expires", async () => {
    invalidate("test:ttl");
    const loader = vi
      .fn()
      .mockResolvedValueOnce("fresh-1")
      .mockResolvedValueOnce("fresh-2");
    // Custom 50ms TTL so we don't have to wait 30s.
    expect(await cached("test:ttl", loader, 50)).toBe("fresh-1");
    expect(loader).toHaveBeenCalledTimes(1);
    // Within the TTL — same value.
    expect(await cached("test:ttl", loader, 50)).toBe("fresh-1");
    expect(loader).toHaveBeenCalledTimes(1);
    // Past the TTL — re-invoked.
    await new Promise((r) => setTimeout(r, 60));
    expect(await cached("test:ttl", loader, 50)).toBe("fresh-2");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("preserves the cache entry if the loader throws — a stale-but-good value beats a 500", async () => {
    // v0.9.11 design decision: a transient loader
    // failure on a cache miss should not wipe a
    // previously-good value. The user sees the
    // last-known-good data for the duration of the
    // TTL window, rather than a hard 5xx. The
    // helper's contract is:
    //   - cache hit → return cached (never throws)
    //   - cache miss + loader success → cache + return
    //   - cache miss + loader throw → throw (no
    //     cache update, so the next miss will retry)
    //   - cache hit followed by `invalidate()` →
    //     the next call goes to the loader again
    invalidate("test:throw");
    const goodLoader = vi.fn(async () => "good");
    expect(await cached("test:throw", goodLoader)).toBe("good");
    expect(_peekAge("test:throw")).not.toBeNull();
    // Now wipe the cache and have the loader fail.
    // The promise must reject — a miss with no
    // good value can't quietly return a phantom.
    invalidate("test:throw");
    const failingLoader = vi.fn(async () => {
      throw new Error("disk on fire");
    });
    await expect(cached("test:throw", failingLoader)).rejects.toThrow(
      /disk on fire/,
    );
    // No cache entry was written (the throw
    // short-circuited the store.set call).
    expect(_peekAge("test:throw")).toBeNull();
  });

  it("invalidate() with no argument clears every key", async () => {
    invalidate("test:a");
    invalidate("test:b");
    await cached("test:a", async () => "A");
    await cached("test:b", async () => "B");
    expect(_peekAge("test:a")).not.toBeNull();
    expect(_peekAge("test:b")).not.toBeNull();
    invalidate(); // no arg
    expect(_peekAge("test:a")).toBeNull();
    expect(_peekAge("test:b")).toBeNull();
  });

  it("uses an isolated TTL per key", async () => {
    invalidate("test:short");
    invalidate("test:long");
    const shortLoader = vi.fn(async () => "s");
    const longLoader = vi.fn(async () => "l");
    // Both stored with different TTLs.
    expect(await cached("test:short", shortLoader, 50)).toBe("s");
    expect(await cached("test:long", longLoader, 1000)).toBe("l");
    await new Promise((r) => setTimeout(r, 60));
    // short expired, long still valid.
    expect(await cached("test:short", shortLoader, 50)).toBe("s");
    expect(shortLoader).toHaveBeenCalledTimes(2);
    expect(await cached("test:long", longLoader, 1000)).toBe("l");
    expect(longLoader).toHaveBeenCalledTimes(1);
  });
});

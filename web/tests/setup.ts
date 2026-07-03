/**
 * Vitest setup — runs before each test file.
 *
 * jsdom (vitest's default browser env) provides window/document but
 * NOT `localStorage` by default. We polyfill it from a fresh Map.
 * (sessionStorage IS provided.)
 *
 * Tests that need localStorage semantics can use this without any
 * per-test boilerplate.
 */

// @vitest-environment jsdom
import { beforeEach, vi } from "vitest";

const store = new Map<string, string>();

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (k: string): string | null => store.get(k) ?? null,
      setItem: (k: string, v: string): void => {
        store.set(k, String(v));
      },
      removeItem: (k: string): void => {
        store.delete(k);
      },
      clear: (): void => {
        store.clear();
      },
      key: (i: number): string | null => Array.from(store.keys())[i] ?? null,
      get length(): number {
        return store.size;
      },
    },
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  store.clear();
  // Stub navigator.clipboard etc. if/when tests need them.
  vi.unstubAllGlobals();
});

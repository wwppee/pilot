import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**', 'dist/**'],
    // Default test timeout — 5s is enough for unit tests that don't hit the network.
    testTimeout: 5_000,
  },
});
/**
 * Vitest config for the integration test tier.
 *
 * Unit tests live under `test/unit/`, integration under `test/integration/`.
 * The default `npm test` runs unit only (with `test/integration/**` excluded
 * via `vitest.config.ts`). To exercise the network-touching integration
 * tests, run:
 *
 *   npm run test:integration
 *
 * which uses THIS config.
 *
 * Integration tests:
 *   - hit the real npm registry
 *   - are slower (15s default timeout per test)
 *   - are NOT part of CI's default `npm test`
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
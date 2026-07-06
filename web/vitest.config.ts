import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror tsconfig.json's paths so component imports like
    // `@/lib/i18n` resolve in test files too.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 5_000,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});

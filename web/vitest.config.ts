import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 5_000,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});

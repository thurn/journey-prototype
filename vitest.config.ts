import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    minThreads: 1,
    maxThreads: 8,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});

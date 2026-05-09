import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
    pool: "threads",
    minThreads: 1,
    maxThreads: 8,
    hookTimeout: 600_000,
    testTimeout: 600_000,
  },
});

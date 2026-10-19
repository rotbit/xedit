import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Unit tests run in the node environment without jsdom: the browser-only localStorage / window / fetch
 * are provided by minimal stubs in tests/setup.ts. What's tested is the real implementation under src, not a copy.
 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});

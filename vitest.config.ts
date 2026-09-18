import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * 单测跑在 node 环境：不引入 jsdom，浏览器只依赖的 localStorage / window / fetch
 * 由 tests/setup.ts 里的最小桩提供。被测的是 src 下的真实实现，不是副本。
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

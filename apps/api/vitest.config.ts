import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/modules/**/**.ts", "src/plugins/**/**.ts", "src/lib/**/**.ts"],
      exclude: ["src/**/__tests__/**"],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 40,
        statements: 40,
      },
    },
  },
});

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules"],
    coverage: {
      enabled: true,
      reporter: ["text", "json", "html"],
      exclude: ["dist", "node_modules"],
      include: ["src/**/*.ts"],
    },
  },
});

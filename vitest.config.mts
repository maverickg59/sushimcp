import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    exclude: ["node_modules"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["src/**/*.spec.ts", "dist", "node_modules"],
      include: ["src/**/*.ts"],
    },
  },
  plugins: [tsconfigPaths({ projects: ["tsconfig.test.json"] })],
});

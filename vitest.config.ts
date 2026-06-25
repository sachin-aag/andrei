import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // DOCX import/export integration tests routinely exceed 5s under full-suite load.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});

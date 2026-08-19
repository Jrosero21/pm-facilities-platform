import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests for the PURE modules only — no DB, no network, no server-only chain.
// Anything needing a database stays in scripts/*.ts (the tsx harnesses).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});

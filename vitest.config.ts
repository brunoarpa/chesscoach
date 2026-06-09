import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only — pure logic and money/ledger invariants. No DB, no network:
// modules under test are written so they don't import the runtime Prisma client.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

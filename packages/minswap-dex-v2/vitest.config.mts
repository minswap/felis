// vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node", // use node env for vitest
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
  },
  define: {
    // Force Vitest to think there's no window
    "typeof window": '"undefined"',
  },
  resolve: {
    alias: {
      "@minswap/cardano-serialization-lib-browser": "@minswap/cardano-serialization-lib-nodejs",
      "@emurgo/cardano-serialization-lib-browser": "@emurgo/cardano-serialization-lib-nodejs",
      "@repo/uplc-web": "@repo/uplc-node",
      "@repo/ledger-core": "@repo/ledger-core/src/index.ts",
      "@repo/ledger-utils": "@repo/ledger-utils/src/index.ts",
    },
  },
});

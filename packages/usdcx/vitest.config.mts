import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
  },
  define: {
    "typeof window": '"undefined"',
  },
  resolve: {
    alias: {
      "@minswap/cardano-serialization-lib-browser": "@minswap/cardano-serialization-lib-nodejs",
      "@emurgo/cardano-serialization-lib-browser": "@emurgo/cardano-serialization-lib-nodejs",
      "@repo/uplc-web": "@repo/uplc-node",
    },
  },
});

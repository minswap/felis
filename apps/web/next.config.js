/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/liqwid/:path*",
        destination: "https://v2.api.preview.liqwid.dev/:path*",
      },
    ];
  },
  turbopack: {
    resolveAlias: {
      // Alias node WASM modules to web versions for browser compatibility
      "@minswap/cardano-serialization-lib-nodejs": "@minswap/cardano-serialization-lib-browser",
      "@emurgo/cardano-serialization-lib-nodejs": "@emurgo/cardano-serialization-lib-browser",
      "@repo/uplc-node": "@repo/uplc-web",
    },
  },
  webpack(config) {
    // Alias node WASM modules to web versions for browser compatibility
    config.resolve.alias["@minswap/cardano-serialization-lib-nodejs"] = "@minswap/cardano-serialization-lib-browser";
    config.resolve.alias["@emurgo/cardano-serialization-lib-nodejs"] = "@emurgo/cardano-serialization-lib-browser";
    config.resolve.alias["@repo/uplc-node"] = "@repo/uplc-web";

    // Enable WebAssembly support
    config.experiments = {
      ...(config.experiments ?? {}),
      asyncWebAssembly: true,
      layers: true,
      syncWebAssembly: true,
    };

    return config;
  },
};

export default nextConfig;

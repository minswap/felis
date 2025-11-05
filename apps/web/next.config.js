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
};

export default nextConfig;

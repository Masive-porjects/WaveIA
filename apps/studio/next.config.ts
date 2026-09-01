import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // aurea.legal/waveai en prod (NEXT_PUBLIC_BASE_PATH=/waveai), "" en dev
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;

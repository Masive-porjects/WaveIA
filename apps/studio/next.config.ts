import type { NextConfig } from "next";

// Misma base que src/adapters/api/config.ts: NEXT_PUBLIC_API_URL en prod,
// localhost solo para desarrollo local.
const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // aurea.legal/waveai en prod (NEXT_PUBLIC_BASE_PATH=/waveai), "" en dev
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;

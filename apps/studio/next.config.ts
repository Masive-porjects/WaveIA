import type { NextConfig } from "next";

// The demo architecture (docs/DEMO_DEPLOYMENT_PLAN.md) FORBIDS proxying the
// mastering backend through Next.js: the browser talks to Railway FastAPI
// directly via the absolute NEXT_PUBLIC_API_URL read in
// src/adapters/api/config.ts. There are deliberately NO rewrites here.
const nextConfig: NextConfig = {
  // Deploy under a subpath (NEXT_PUBLIC_BASE_PATH=/waveai) or at root ("").
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

export default nextConfig;

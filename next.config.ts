import type { NextConfig } from "next";

// Content-Security-Policy is set in src/proxy.ts (Next.js 16's Proxy, formerly
// Middleware), the single source of truth for this header -- it runs after
// this config's headers() and would silently override any value set here,
// which previously left two copies of the same policy string to keep in sync.
const nextConfig: NextConfig = {};

export default nextConfig;

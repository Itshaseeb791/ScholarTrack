import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Reuse a just-visited page for 30s on client navigation (in memory only; cleared by the hard reload on sign-out).
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  async headers() {
    return [{
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-store, max-age=0" },
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Service-Worker-Allowed", value: "/" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

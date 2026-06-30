import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "img-src 'self' data: blob: https://upload.wikimedia.org https://*.supabase.co",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

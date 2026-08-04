import type { NextConfig } from "next";

const r2PublicUrl = process.env.R2_PUBLIC_URL;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2PublicUrl
      ? [{ protocol: "https", hostname: new URL(r2PublicUrl).hostname }]
      : [],
  },
};

export default nextConfig;

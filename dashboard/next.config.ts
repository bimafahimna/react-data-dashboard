import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: '/dashboard/home',
        destination: '/dashboard',
        permanent: true, // Returns 308 (permanent)
      },
    ]
  },
};

export default nextConfig;

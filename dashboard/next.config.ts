import type { NextConfig } from "next";
import "./env"

process.env.NEXTAUTH_URL ||= process.env.AUTH_URL;
process.env.NEXTAUTH_SECRET ||= process.env.AUTH_SECRET;

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow verification builds alongside a running local development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { unoptimized: true },
  outputFileTracingRoot: path.join(process.cwd()),
};

export default nextConfig;

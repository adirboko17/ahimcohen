import path from "path";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const development = phase === PHASE_DEVELOPMENT_SERVER;
  const compiler = process.env.TURBOPACK ? "turbopack" : "webpack";
  // Next sets PORT to the actual listening port before loading server config.
  // Never let two dev servers (or a production build) overwrite each other's
  // chunks and React client manifests, even when using different compilers.
  const port = process.env.PORT || "3000";
  return {
    reactStrictMode: true,
    distDir: process.env.NEXT_DIST_DIR || (development ? `.next-dev/${compiler}-${port}` : ".next"),
    images: { unoptimized: true },
    outputFileTracingRoot: path.join(process.cwd()),
    outputFileTracingIncludes: { "/*": ["./.generated/catalog-bootstrap.json"] },
  };
}

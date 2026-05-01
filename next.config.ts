import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** Pin Turbopack to this app when a parent directory has a stray lockfile. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  experimental: {
    viewTransition: true,
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  outputFileTracingIncludes: {
    "/api/*": ["./templates/**/*"],
  },
};

export default nextConfig;

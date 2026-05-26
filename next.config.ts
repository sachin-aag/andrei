import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/** Pin Turbopack to this app when a parent directory has a stray lockfile. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Playwright hits 127.0.0.1 while Next dev binds localhost; allow HMR/client hydration.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@napi-rs/canvas", "mathlive"],
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
    "/api/*": [
      "./templates/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
      "./node_modules/wmf/dist/**/*",
      "./node_modules/mathlive/**/*",
    ],
  },
};

export default nextConfig;

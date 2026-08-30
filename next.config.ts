import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { assertCustomerEnvAgreement } from "./src/lib/customers/resolve";
import {
  POSTHOG_EU_API_HOST,
  POSTHOG_EU_ASSETS_HOST,
  POSTHOG_PROXY_PATH,
} from "./src/lib/analytics/posthog-config";
import { pdfjsAssetCacheHeaders } from "./src/lib/attachments/pdfjs-browser";

/** Pin Turbopack to this app when a parent directory has a stray lockfile. */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

assertCustomerEnvAgreement();

const nextConfig: NextConfig = {
  // PostHog API uses trailing slashes (/e/, /s/); don't 308-strip them or replay uploads break.
  skipTrailingSlashRedirect: true,
  // Playwright hits 127.0.0.1 while Next dev binds localhost; allow HMR/client hydration.
  allowedDevOrigins: ["127.0.0.1"],
  // Keep native / dynamic-require deps external so NFT copies real files (not pnpm symlinks).
  // mathlive omitted: client components import mathlive/static.css, which cannot be externalized.
  serverExternalPackages: [
    "@google-cloud/storage",
    "@google-cloud/speech",
    "@napi-rs/canvas",
    "wmf",
  ],
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
    "/api/*": ["./templates/**/*", "./src/lib/import/fonts/**/*.ttf"],
  },
  async headers() {
    return pdfjsAssetCacheHeaders();
  },
  async rewrites() {
    const proxyPrefix = POSTHOG_PROXY_PATH.replace(/^\//, "");
    return [
      {
        source: `/${proxyPrefix}/static/:path(.*)`,
        destination: `${POSTHOG_EU_ASSETS_HOST}/static/:path`,
      },
      {
        source: `/${proxyPrefix}/array/:path(.*)`,
        destination: `${POSTHOG_EU_ASSETS_HOST}/array/:path`,
      },
      {
        source: `/${proxyPrefix}/:path(.*)`,
        destination: `${POSTHOG_EU_API_HOST}/:path`,
      },
    ];
  },
};

export default withWorkflow(nextConfig);

import { authBaseUrl, previewDeploymentOrigin } from "@/lib/auth/auth-base-url";

/**
 * NextAuth rewrites every auth request to `AUTH_URL` when set (see
 * `next-auth/lib/env.js` `reqWithEnvURL`). A stale Production `AUTH_URL`
 * pointing at `*.vercel.app` after a custom-domain cutover makes the session
 * cookie miss on the public host (proxy 401s) and sends workflow callbacks
 * at a deployment-protected URL.
 *
 * Preview: pin to the branch alias (`VERCEL_BRANCH_URL`) else `VERCEL_URL`.
 * Production: pin to `authBaseUrl()` (custom AUTH_URL or
 * `VERCEL_PROJECT_PRODUCTION_URL`).
 */
export function applyDeploymentAuthUrl(): void {
  const previewOrigin = previewDeploymentOrigin();
  if (previewOrigin) {
    process.env.AUTH_URL = previewOrigin;
    process.env.NEXTAUTH_URL = previewOrigin;
    return;
  }

  if (process.env.VERCEL_ENV !== "production") return;

  const origin = authBaseUrl();
  process.env.AUTH_URL = origin;
  process.env.NEXTAUTH_URL = origin;
}

applyDeploymentAuthUrl();

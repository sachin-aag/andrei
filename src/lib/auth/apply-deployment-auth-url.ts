import { previewDeploymentOrigin } from "@/lib/auth/auth-base-url";

/**
 * NextAuth rewrites every auth request to `AUTH_URL` when set (see
 * `next-auth/lib/env.js` `reqWithEnvURL`). Preview deployments that inherit
 * Production `AUTH_URL` would redirect users off the preview host.
 *
 * On Vercel Preview only, pin AUTH_URL to the branch alias when available
 * (`VERCEL_BRANCH_URL`), else the deployment host (`VERCEL_URL`).
 */
export function applyDeploymentAuthUrl(): void {
  const previewOrigin = previewDeploymentOrigin();
  if (!previewOrigin) return;

  process.env.AUTH_URL = previewOrigin;
  process.env.NEXTAUTH_URL = previewOrigin;
}

applyDeploymentAuthUrl();

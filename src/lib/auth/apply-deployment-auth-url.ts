/**
 * NextAuth rewrites every auth request to `AUTH_URL` when set (see
 * `next-auth/lib/env.js` `reqWithEnvURL`). Preview deployments that inherit
 * Production `AUTH_URL=https://andrei-demo.vercel.app` redirect users to prod.
 *
 * On Vercel Preview only, pin AUTH_URL to this deployment's host.
 */
export function applyDeploymentAuthUrl(): void {
  if (process.env.VERCEL_ENV !== "preview") return;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) return;

  const previewOrigin = vercelUrl.startsWith("http")
    ? vercelUrl.replace(/\/$/, "")
    : `https://${vercelUrl}`;

  process.env.AUTH_URL = previewOrigin;
  process.env.NEXTAUTH_URL = previewOrigin;
}

applyDeploymentAuthUrl();

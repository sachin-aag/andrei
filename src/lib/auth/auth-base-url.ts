function toHttpsOrigin(hostOrUrl: string): string {
  const trimmed = hostOrUrl.trim().replace(/\/$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

/**
 * Stable Preview origin for auth redirects and emails.
 * Prefer `VERCEL_BRANCH_URL` (git-branch alias) over `VERCEL_URL` (per-deployment
 * host) so opening `*-git-*-….vercel.app` does not bounce to `*-xxxxx-….vercel.app`.
 */
export function previewDeploymentOrigin(): string | null {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const host =
    process.env.VERCEL_BRANCH_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!host) return null;
  return toHttpsOrigin(host);
}

/** Canonical app base URL for auth emails (magic link, password reset). */
export function authBaseUrl(): string {
  const previewOrigin = previewDeploymentOrigin();
  if (previewOrigin) return previewOrigin;

  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

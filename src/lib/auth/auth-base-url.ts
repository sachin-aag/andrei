function toHttpsOrigin(hostOrUrl: string): string {
  const trimmed = hostOrUrl.trim().replace(/\/$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

/** True when the origin is a Vercel-generated `*.vercel.app` host (not a custom domain). */
export function isVercelAppOrigin(originOrHost: string): boolean {
  try {
    const hostname = new URL(toHttpsOrigin(originOrHost)).hostname;
    return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
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

/**
 * Vercel primary production host (`VERCEL_PROJECT_PRODUCTION_URL`).
 * After a custom-domain cutover this is `mj.andreihealth.com`, not `*.vercel.app`.
 */
export function productionDeploymentOrigin(): string | null {
  if (process.env.VERCEL_ENV !== "production") return null;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (!host) return null;
  return toHttpsOrigin(host);
}

/** Canonical app base URL for auth emails (magic link, password reset). */
export function authBaseUrl(): string {
  const previewOrigin = previewDeploymentOrigin();
  if (previewOrigin) return previewOrigin;

  const authUrl = process.env.AUTH_URL?.replace(/\/$/, "");
  // Explicit custom AUTH_URL wins even if Vercel still lists *.vercel.app as
  // the production domain (cutover in progress).
  if (authUrl && !isVercelAppOrigin(authUrl)) {
    return authUrl;
  }

  const productionOrigin = productionDeploymentOrigin();
  if (productionOrigin) return productionOrigin;

  if (authUrl) return authUrl;
  if (process.env.VERCEL_URL) {
    return toHttpsOrigin(process.env.VERCEL_URL);
  }
  return "http://localhost:3000";
}

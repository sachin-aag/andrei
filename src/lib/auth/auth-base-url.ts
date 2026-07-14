function previewDeploymentOrigin(): string | null {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (!vercelUrl) return null;
  return vercelUrl.startsWith("http")
    ? vercelUrl.replace(/\/$/, "")
    : `https://${vercelUrl}`;
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

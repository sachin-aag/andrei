/** Origin the browser will send on PUT — must match the resumable session. */
export function browserOriginFromRequest(req: Request): string | null {
  const origin = req.headers.get("origin")?.trim();
  if (origin) return origin;

  const referer = req.headers.get("referer")?.trim();
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

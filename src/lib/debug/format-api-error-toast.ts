/** Temporary — surfaces debug fields from report-create API errors in toasts. */

export type ApiErrorBody = {
  error?: string;
  debugStep?: string;
  debugMessage?: string;
  debugDb?: {
    fingerprint?: string | null;
    host?: string | null;
    database?: string | null;
  };
};

export async function readApiErrorResponse(
  res: Response
): Promise<ApiErrorBody & { httpStatus: number }> {
  const httpStatus = res.status;
  const text = await res.text();
  if (!text.trim()) {
    return { httpStatus, error: `Request failed (HTTP ${httpStatus})` };
  }
  try {
    return { ...(JSON.parse(text) as ApiErrorBody), httpStatus };
  } catch {
    const isHtml = /^\s*</.test(text) || text.includes("__next_error__");
    return {
      httpStatus,
      error: isHtml
        ? `Server error (HTTP ${httpStatus}). The API returned an HTML error page instead of JSON — often a crash while loading the route on Vercel.`
        : `Request failed (HTTP ${httpStatus})`,
      debugMessage: isHtml
        ? "Check Vercel function logs for this deployment."
        : text.slice(0, 400),
    };
  }
}

export function formatApiErrorToast(
  body: ApiErrorBody & { httpStatus?: number },
  fallback: string
): string {
  const lines: string[] = [];

  const main = body.error?.trim();
  if (main) {
    lines.push(main);
  } else {
    lines.push(fallback);
  }

  if (body.httpStatus && !main?.includes(`HTTP ${body.httpStatus}`)) {
    lines.push(`HTTP ${body.httpStatus}`);
  }
  if (body.debugStep) lines.push(`Step: ${body.debugStep}`);
  if (body.debugMessage && body.debugMessage !== main) {
    lines.push(body.debugMessage);
  }
  if (body.debugDb?.fingerprint) {
    lines.push(`DB: ${body.debugDb.fingerprint}`);
  } else if (body.debugDb?.host) {
    lines.push(`DB host: ${body.debugDb.host}`);
  }

  return lines.join("\n");
}

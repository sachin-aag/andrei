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
    return {
      httpStatus,
      error: `Request failed (HTTP ${httpStatus})`,
      debugMessage: text.slice(0, 400),
    };
  }
}

export function formatApiErrorToast(
  body: ApiErrorBody & { httpStatus?: number },
  fallback: string
): string {
  const lines: string[] = [];

  const main = body.error?.trim();
  if (main && main !== fallback) {
    lines.push(main);
  } else if (body.debugMessage?.trim()) {
    lines.push(fallback);
  } else {
    lines.push(main || fallback);
  }

  if (body.httpStatus) lines.push(`HTTP ${body.httpStatus}`);
  if (body.debugStep) lines.push(`Step: ${body.debugStep}`);
  if (body.debugMessage) lines.push(body.debugMessage);
  if (body.debugDb?.fingerprint) {
    lines.push(`DB: ${body.debugDb.fingerprint}`);
  } else if (body.debugDb?.host) {
    lines.push(`DB host: ${body.debugDb.host}`);
  }

  return lines.join("\n");
}

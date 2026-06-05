export type StartImproveAiFromReportResult =
  | {
      ok: true;
      sessionId: string;
      needsConfirmation: false;
    }
  | {
      ok: true;
      sessionId: string;
      needsConfirmation: true;
    }
  | {
      ok: false;
      error: string;
    };

export async function startImproveAiFromReport(
  reportId: string,
  options?: { confirmRerun?: boolean }
): Promise<StartImproveAiFromReportResult> {
  const res = await fetch("/api/improve-ai/from-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reportId,
      confirmRerun: options?.confirmRerun ?? false,
    }),
  });

  const data = (await res.json()) as {
    sessionId?: string;
    needsConfirmation?: boolean;
    error?: string;
  };

  if (!res.ok || !data.sessionId) {
    return { ok: false, error: data.error ?? "Could not start evaluation" };
  }

  if (data.needsConfirmation) {
    return {
      ok: true,
      sessionId: data.sessionId,
      needsConfirmation: true,
    };
  }

  return {
    ok: true,
    sessionId: data.sessionId,
    needsConfirmation: false,
  };
}

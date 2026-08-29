import type { ReportAnalyticsView } from "./types";

export class AnalyticsConflictError extends Error {
  readonly analytics: ReportAnalyticsView;

  constructor(analytics: ReportAnalyticsView, message = "Worksheet was updated elsewhere.") {
    super(message);
    this.name = "AnalyticsConflictError";
    this.analytics = analytics;
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Body may be empty or HTML.
  }
  return `Request failed (${response.status})`;
}

async function parseAnalytics(response: Response): Promise<ReportAnalyticsView> {
  const body = (await response.json()) as { analytics: ReportAnalyticsView };
  return body.analytics;
}

function analyticsUrl(reportId: string, suffix = ""): string {
  return `/api/reports/${encodeURIComponent(reportId)}/analytics${suffix}`;
}

export async function getReportAnalytics(
  reportId: string
): Promise<ReportAnalyticsView> {
  const response = await fetch(analyticsUrl(reportId));
  if (!response.ok) throw new Error(await readError(response));
  return parseAnalytics(response);
}

export async function patchReportAnalytics(
  reportId: string,
  body: {
    worksheet: ReportAnalyticsView["worksheet"];
    version?: number;
  },
  signal?: AbortSignal
): Promise<ReportAnalyticsView> {
  const response = await fetch(analyticsUrl(reportId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (response.status === 409) {
    try {
      const payload = (await response.json()) as {
        error?: string;
        analytics?: ReportAnalyticsView;
      };
      if (payload.analytics) {
        throw new AnalyticsConflictError(
          payload.analytics,
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Worksheet was updated elsewhere."
        );
      }
    } catch (error) {
      if (error instanceof AnalyticsConflictError) throw error;
    }
    throw new Error("Worksheet was updated elsewhere.");
  }
  if (!response.ok) throw new Error(await readError(response));
  return parseAnalytics(response);
}

export async function createCapabilitySixpack(
  reportId: string,
  input: {
    columnId: string;
    title?: string;
    lsl: number | null;
    usl: number | null;
    target: number | null;
    rowStart?: number | null;
    rowEnd?: number | null;
    rows?: number[];
  }
): Promise<{ analytics: ReportAnalyticsView; analysisId: string }> {
  return postAnalysis(reportId, input);
}

export async function createMeasurementScatter(
  reportId: string,
  input: {
    query: string;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    layout?: {
      mode?: "combined" | "per-series";
      seriesBy?: "unit" | "none";
      xAxis?: "sequential" | "replicate";
      yMax?: number;
    };
    lsl?: number | null;
    usl?: number | null;
  }
): Promise<{ analytics: ReportAnalyticsView; analysisId: string }> {
  return postAnalysis(reportId, {
    kind: "measurement_scatter",
    ...input,
  });
}

export async function createOneWayAnova(
  reportId: string,
  input: {
    responseColumnId: string;
    factorColumnId: string;
    title?: string;
    rowStart?: number | null;
    rowEnd?: number | null;
    rows?: number[];
    alpha?: number;
  }
): Promise<{ analytics: ReportAnalyticsView; analysisId: string }> {
  return postAnalysis(reportId, {
    kind: "one_way_anova",
    ...input,
  });
}

export async function createXyScatter(
  reportId: string,
  input: {
    xColumnId: string;
    yColumnId: string;
    title?: string;
    rowStart?: number | null;
    rowEnd?: number | null;
    rows?: number[];
  }
): Promise<{ analytics: ReportAnalyticsView; analysisId: string }> {
  return postAnalysis(reportId, {
    kind: "xy_scatter",
    ...input,
  });
}

async function postAnalysis(
  reportId: string,
  input: unknown
): Promise<{ analytics: ReportAnalyticsView; analysisId: string }> {
  const response = await fetch(analyticsUrl(reportId, "/analyses"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as {
    analytics: ReportAnalyticsView;
    analysis?: { id: string };
  };
  const analysisId = body.analysis?.id ?? body.analytics.analyses[0]?.id;
  if (!analysisId) {
    throw new Error("The analysis was saved but no id was returned.");
  }
  return { analytics: body.analytics, analysisId };
}

export async function recomputeCapabilitySixpack(
  reportId: string,
  analysisId: string
): Promise<ReportAnalyticsView> {
  const response = await fetch(
    analyticsUrl(reportId, `/analyses/${encodeURIComponent(analysisId)}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "recompute" }),
    }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseAnalytics(response);
}

export async function updateAnalysis(
  reportId: string,
  analysisId: string,
  input: unknown
): Promise<ReportAnalyticsView> {
  const response = await fetch(
    analyticsUrl(reportId, `/analyses/${encodeURIComponent(analysisId)}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", ...(input as object) }),
    }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseAnalytics(response);
}

export async function deleteCapabilitySixpack(
  reportId: string,
  analysisId: string
): Promise<ReportAnalyticsView> {
  const response = await fetch(
    analyticsUrl(reportId, `/analyses/${encodeURIComponent(analysisId)}`),
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(await readError(response));
  return parseAnalytics(response);
}

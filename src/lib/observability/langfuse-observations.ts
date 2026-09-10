/**
 * Langfuse Observations API v2 — replacement for the deprecated traces
 * list/get endpoints. Group rows by `traceId`. Former trace input/output
 * lives on the logical root (`isRootObservation` or a null parent).
 */

export const LANGFUSE_OBSERVATIONS_V2_PATH = "/api/public/v2/observations";

/** Default field groups for reconstructing former trace reads. */
export const TRACE_REPLACEMENT_FIELDS =
  "core,basic,io,trace_context,usage" as const;

export type LangfuseObservation = {
  id: string;
  traceId: string;
  startTime: string;
  endTime?: string | null;
  parentObservationId?: string | null;
  type?: string;
  name?: string;
  userId?: string | null;
  sessionId?: string | null;
  isRootObservation?: boolean;
  input?: unknown;
  output?: unknown;
  tags?: string[];
  traceName?: string;
  [key: string]: unknown;
};

export type ListObservationsParams = {
  fromStartTime: string;
  toStartTime: string;
  traceId?: string;
  userId?: string;
  type?: string;
  name?: string;
  isRootObservation?: boolean;
  fields?: string;
  limit?: number;
  cursor?: string;
  /** Advanced JSON filter; used for sessionId and other v2-only columns. */
  filter?: unknown[];
};

export type ListObservationsResult = {
  data: LangfuseObservation[];
  cursor: string | null;
};

export function langfuseApiBaseUrl(): string {
  const fromBase = process.env.LANGFUSE_BASE_URL?.trim();
  const fromHost = process.env.LANGFUSE_HOST?.trim();
  const url = (fromBase || fromHost || "").replace(/\/$/, "");
  if (!url) {
    throw new Error("LANGFUSE_BASE_URL or LANGFUSE_HOST is required");
  }
  return url;
}

function basicAuthHeader(): string {
  const pk = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const sk = process.env.LANGFUSE_SECRET_KEY?.trim();
  if (!pk || !sk) {
    throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required");
  }
  return `Basic ${Buffer.from(`${pk}:${sk}`).toString("base64")}`;
}

function toIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid observation time bound: ${value}`);
  }
  return date.toISOString();
}

/** Inclusive `from` / exclusive-ish `to` window required by Observations v2. */
export function observationTimeRange(options?: {
  hours?: number;
  fromStartTime?: string;
  toStartTime?: string;
}): { fromStartTime: string; toStartTime: string } {
  if (options?.fromStartTime && options?.toStartTime) {
    return {
      fromStartTime: toIso(options.fromStartTime),
      toStartTime: toIso(options.toStartTime),
    };
  }
  const hours = options?.hours ?? 24;
  const to = options?.toStartTime
    ? new Date(toIso(options.toStartTime))
    : new Date();
  const from = options?.fromStartTime
    ? new Date(toIso(options.fromStartTime))
    : new Date(to.getTime() - hours * 60 * 60 * 1000);
  return { fromStartTime: from.toISOString(), toStartTime: to.toISOString() };
}

export function observationsV2Url(params: ListObservationsParams): string {
  if (!params.fromStartTime || !params.toStartTime) {
    throw new Error("fromStartTime and toStartTime are required");
  }
  const url = new URL(`${langfuseApiBaseUrl()}${LANGFUSE_OBSERVATIONS_V2_PATH}`);
  url.searchParams.set("fromStartTime", toIso(params.fromStartTime));
  url.searchParams.set("toStartTime", toIso(params.toStartTime));
  url.searchParams.set("fields", params.fields ?? TRACE_REPLACEMENT_FIELDS);
  url.searchParams.set("limit", String(params.limit ?? 50));
  if (params.traceId) url.searchParams.set("traceId", params.traceId);
  if (params.userId) url.searchParams.set("userId", params.userId);
  if (params.type) url.searchParams.set("type", params.type);
  if (params.name) url.searchParams.set("name", params.name);
  if (params.isRootObservation !== undefined) {
    url.searchParams.set("isRootObservation", String(params.isRootObservation));
  }
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  if (params.filter && params.filter.length > 0) {
    url.searchParams.set("filter", JSON.stringify(params.filter));
  }
  return url.toString();
}

export async function listObservations(
  params: ListObservationsParams
): Promise<ListObservationsResult> {
  const response = await fetch(observationsV2Url(params), {
    headers: {
      Authorization: basicAuthHeader(),
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Langfuse observations v2 failed (${response.status}): ${body.slice(0, 300)}`
    );
  }
  const json = (await response.json()) as {
    data?: LangfuseObservation[];
    meta?: { cursor?: string | null };
  };
  return {
    data: Array.isArray(json.data) ? json.data : [],
    cursor: json.meta?.cursor ?? null,
  };
}

export async function listAllObservations(
  params: ListObservationsParams,
  options?: { maxPages?: number }
): Promise<LangfuseObservation[]> {
  const maxPages = options?.maxPages ?? 20;
  const rows: LangfuseObservation[] = [];
  let cursor: string | undefined = params.cursor;
  for (let page = 0; page < maxPages; page++) {
    const result = await listObservations({ ...params, cursor });
    rows.push(...result.data);
    if (!result.cursor) break;
    cursor = result.cursor;
  }
  return rows;
}

/** Fetch every observation that shares a trace id (former single-trace get). */
export async function listObservationsForTrace(
  traceId: string,
  timeRange: { fromStartTime: string; toStartTime: string },
  options?: { fields?: string; limit?: number }
): Promise<LangfuseObservation[]> {
  return listAllObservations({
    ...timeRange,
    traceId,
    fields: options?.fields ?? TRACE_REPLACEMENT_FIELDS,
    limit: options?.limit ?? 100,
  });
}

/** One logical-root observation per trace (former traces list). */
export async function listRootObservations(
  timeRange: { fromStartTime: string; toStartTime: string },
  options?: { limit?: number; fields?: string }
): Promise<LangfuseObservation[]> {
  return listAllObservations({
    ...timeRange,
    isRootObservation: true,
    fields: options?.fields ?? TRACE_REPLACEMENT_FIELDS,
    limit: options?.limit ?? 50,
  });
}

export function groupObservationsByTraceId(
  rows: LangfuseObservation[]
): Map<string, LangfuseObservation[]> {
  const grouped = new Map<string, LangfuseObservation[]>();
  for (const row of rows) {
    const list = grouped.get(row.traceId) ?? [];
    list.push(row);
    grouped.set(row.traceId, list);
  }
  return grouped;
}

export function sessionIdFilter(sessionId: string): unknown[] {
  return [
    {
      type: "string",
      column: "sessionId",
      operator: "=",
      value: sessionId,
    },
  ];
}

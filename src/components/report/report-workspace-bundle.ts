import type { ReportBundle } from "@/types/report";

export const WORKSPACE_BUNDLE_TIMEOUT_MS = 10_000;

const inflightByReportId = new Map<string, Promise<ReportBundle>>();

export class WorkspaceLoadError extends Error {
  readonly status: number;
  readonly timedOut: boolean;

  constructor({
    status,
    timedOut = false,
    message,
  }: {
    status: number;
    timedOut?: boolean;
    message: string;
  }) {
    super(message);
    this.name = "WorkspaceLoadError";
    this.status = status;
    this.timedOut = timedOut;
  }
}

export function workspaceLoadErrorMessage(
  status: number,
  timedOut = false
): string {
  if (timedOut) {
    return "This report is taking too long to load. Refresh the page to try again.";
  }
  if (status === 401)
    return "Your session has expired. Sign in again to open this report.";
  if (status === 404) return "This report was not found.";
  if (status === 403) return "You do not have access to this report.";
  return "The report could not be loaded.";
}

export function normalizeWorkspaceBundle(data: ReportBundle): ReportBundle {
  return {
    ...data,
    attachments: data.attachments ?? [],
    attachmentFolders: data.attachmentFolders ?? [],
  };
}

/**
 * One in-flight GET per report. A remount must not abort the request — the
 * previous loader swallowed AbortError and left "Loading report…" forever.
 */
export function fetchWorkspaceBundle(
  reportId: string,
  options?: { timeoutMs?: number }
): Promise<ReportBundle> {
  const existing = inflightByReportId.get(reportId);
  if (existing) return existing;

  const pending = fetchWorkspaceBundleOnce(reportId, options).finally(() => {
    if (inflightByReportId.get(reportId) === pending) {
      inflightByReportId.delete(reportId);
    }
  });
  inflightByReportId.set(reportId, pending);
  return pending;
}

export function clearWorkspaceBundleInflight() {
  inflightByReportId.clear();
}

async function fetchWorkspaceBundleOnce(
  reportId: string,
  options?: { timeoutMs?: number }
): Promise<ReportBundle> {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(),
    options?.timeoutMs ?? WORKSPACE_BUNDLE_TIMEOUT_MS
  );
  try {
    const res = await fetch(`/api/reports/${reportId}`, {
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new WorkspaceLoadError({
        status: res.status,
        message: workspaceLoadErrorMessage(res.status),
      });
    }
    const data = (await res.json()) as ReportBundle;
    return normalizeWorkspaceBundle(data);
  } catch (err) {
    if (err instanceof WorkspaceLoadError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new WorkspaceLoadError({
        status: 0,
        timedOut: true,
        message: workspaceLoadErrorMessage(0, true),
      });
    }
    throw new WorkspaceLoadError({
      status: 0,
      message: workspaceLoadErrorMessage(0),
    });
  } finally {
    clearTimeout(timer);
  }
}

import type { ReportBundle } from "@/types/report";
import { emitWorkspaceLoadStage } from "@/lib/workspace-load-telemetry-client";
import { WORKSPACE_LOAD_ID_HEADER } from "@/lib/workspace-load-telemetry";

/**
 * Slow is acceptable, a dead spinner is not: long enough for a cold
 * serverless start on a large report, and the error screen offers a retry.
 */
export const WORKSPACE_BUNDLE_TIMEOUT_MS = 45_000;

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
  options?: { timeoutMs?: number; loadId?: string }
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
  options?: { timeoutMs?: number; loadId?: string }
): Promise<ReportBundle> {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(),
    options?.timeoutMs ?? WORKSPACE_BUNDLE_TIMEOUT_MS
  );
  emitWorkspaceLoadStage("bundle_request_start");
  try {
    const headers = new Headers();
    if (options?.loadId) {
      headers.set(WORKSPACE_LOAD_ID_HEADER, options.loadId);
    }
    const res = await fetch(`/api/reports/${reportId}`, {
      signal: ac.signal,
      cache: "no-store",
      headers,
    });
    const text = await res.text();
    emitWorkspaceLoadStage("bundle_response", {
      status: res.status,
      bytes: text.length,
    });
    if (!res.ok) {
      throw new WorkspaceLoadError({
        status: res.status,
        message: workspaceLoadErrorMessage(res.status),
      });
    }
    const data = JSON.parse(text) as ReportBundle;
    emitWorkspaceLoadStage("bundle_parsed", { bytes: text.length });
    return normalizeWorkspaceBundle(data);
  } catch (err) {
    if (err instanceof WorkspaceLoadError) {
      emitWorkspaceLoadStage(err.timedOut ? "timeout" : "error", {
        status: err.status,
      });
      throw err;
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      emitWorkspaceLoadStage("timeout");
      throw new WorkspaceLoadError({
        status: 0,
        timedOut: true,
        message: workspaceLoadErrorMessage(0, true),
      });
    }
    emitWorkspaceLoadStage("error");
    throw new WorkspaceLoadError({
      status: 0,
      message: workspaceLoadErrorMessage(0),
    });
  } finally {
    clearTimeout(timer);
  }
}

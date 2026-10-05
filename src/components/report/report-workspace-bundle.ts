import type { ReportBundle } from "@/types/report";

export function workspaceLoadErrorMessage(status: number): string {
  if (status === 401) return "Your session has expired. Sign in again to open this report.";
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

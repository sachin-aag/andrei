import type { WorkspaceChrome } from "@/components/report/workspace-chrome";

export function isWorkspaceChrome(value: unknown): value is WorkspaceChrome {
  return value === "document" || value === "agent";
}

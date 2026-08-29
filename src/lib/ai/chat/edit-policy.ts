import type { WorkspaceChrome } from "@/components/report/workspace-chrome";

export type ChatEditPolicy = "propose" | "commit";

export function isWorkspaceChrome(value: unknown): value is WorkspaceChrome {
  return value === "document" || value === "agent";
}

/** Server-derived. Never trust a client `editPolicy` on a locked report. */
export function deriveChatEditPolicy(args: {
  workspaceChrome: WorkspaceChrome;
  canEdit: boolean;
}): ChatEditPolicy {
  if (!args.canEdit) return "propose";
  return args.workspaceChrome === "agent" ? "commit" : "propose";
}

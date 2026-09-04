import type { WorkspaceChrome } from "@/components/report/workspace-chrome";

export type ChatEditPolicy = "propose" | "commit";

export function isWorkspaceChrome(value: unknown): value is WorkspaceChrome {
  return value === "document" || value === "agent";
}

/**
 * Server-derived. Report chat always proposes — Agent and Document chrome
 * share the same accept/dismiss review. Never trust a client `editPolicy`.
 * `canEdit` still gates write tools on the route; a locked report must
 * never commit even if a caller passes `commit`.
 */
export function deriveChatEditPolicy(args: {
  workspaceChrome: WorkspaceChrome;
  canEdit: boolean;
}): ChatEditPolicy {
  // Chrome is layout-only. `canEdit` still belongs on the caller so write
  // tools can stay gated; live report chat never commits either way.
  void args.workspaceChrome;
  void args.canEdit;
  return "propose";
}

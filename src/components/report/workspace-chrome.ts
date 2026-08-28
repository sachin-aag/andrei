export type WorkspaceChrome = "document" | "agent";
export type WorkProductView = "report" | "analytics";

export function isWorkspaceChrome(value: unknown): value is WorkspaceChrome {
  return value === "document" || value === "agent";
}

export function isWorkProductView(value: unknown): value is WorkProductView {
  return value === "report" || value === "analytics";
}

/**
 * Document chrome follows the focused work-product pane. Agent chrome uses
 * the composer's explicit Report | Analytics dropdown.
 */
export function chatWorkProductTarget(args: {
  chrome: WorkspaceChrome;
  workProductView: WorkProductView;
  agentTarget: WorkProductView;
  statsEnabled: boolean;
}): WorkProductView {
  if (!args.statsEnabled) return "report";
  if (args.chrome === "agent") return args.agentTarget;
  return args.workProductView;
}

/** Agent chrome hides the Criteria tab behind Assistant — reveal it when a run finishes. */
export function shouldRevealCriteriaTab(args: {
  wasEvaluating: boolean;
  isEvaluating: boolean;
  chrome: WorkspaceChrome;
  workProductView: WorkProductView;
}): boolean {
  return (
    args.wasEvaluating &&
    !args.isEvaluating &&
    args.chrome === "agent" &&
    args.workProductView === "report"
  );
}

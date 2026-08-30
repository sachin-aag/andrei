export type WorkspaceChrome = "document" | "agent";
export type WorkProductView = "report" | "analytics";

export function isWorkspaceChrome(value: unknown): value is WorkspaceChrome {
  return value === "document" || value === "agent";
}

export function isWorkProductView(value: unknown): value is WorkProductView {
  return value === "report" || value === "analytics";
}

/**
 * Composer Report | Analytics is independent of the focused canvas pane in
 * both Document and Agent chrome. Switching Report ↔ Analytics on the
 * canvas does not retarget chat (including an in-flight turn). Statistical
 * Analysis off always forces report.
 */
export function chatWorkProductTarget(args: {
  agentTarget: WorkProductView;
  statsEnabled: boolean;
}): WorkProductView {
  if (!args.statsEnabled) return "report";
  return args.agentTarget;
}

/**
 * After Suggest fixes or a document-chrome chat proposal lands, keep the
 * assistant as the engineer left it. Collapsing it hid the thread they were
 * using. The review margin stays opt-in via the Comments switch.
 */
export function shouldCollapseAssistantOnSuggestionFocus(): boolean {
  return false;
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

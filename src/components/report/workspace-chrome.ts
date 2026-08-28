export type WorkspaceChrome = "document" | "agent";
export type WorkProductView = "report" | "analytics";

export function isWorkspaceChrome(value: unknown): value is WorkspaceChrome {
  return value === "document" || value === "agent";
}

export function isWorkProductView(value: unknown): value is WorkProductView {
  return value === "report" || value === "analytics";
}

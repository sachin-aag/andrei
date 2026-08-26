import { createHash } from "node:crypto";
import type { AnalysisRowSelection } from "./row-selection";
import { analysisSourceKey } from "./worksheet";
import type { WorksheetColumn } from "./types";

export function hashColumnSource(
  column: WorksheetColumn,
  selection: AnalysisRowSelection = { mode: "all" }
): string {
  return createHash("sha256")
    .update(analysisSourceKey(column, selection))
    .digest("hex");
}

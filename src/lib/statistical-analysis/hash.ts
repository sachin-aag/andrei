import { createHash } from "node:crypto";
import { trimTrailingEmpty } from "./worksheet";
import type { WorksheetColumn } from "./types";

export function hashColumnSource(column: WorksheetColumn): string {
  return createHash("sha256")
    .update(JSON.stringify(trimTrailingEmpty(column.values)))
    .digest("hex");
}

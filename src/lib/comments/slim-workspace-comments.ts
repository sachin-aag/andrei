/**
 * Applied AI suggestions keep a full tableOperation / insert payload on the
 * comment row for audit. After Apply all that JSON can be tens of KB per
 * card and ~1MB per ELR. The live editor only needs open suggestions; shipping
 * resolved bodies on every /edit RSC freezes Chrome on "Loading report…".
 */
export function slimWorkspaceComments<
  T extends { kind: string; status: string; content: string },
>(rows: T[]): T[] {
  return rows.map((row) => {
    if (row.status === "open") return row;
    if (row.kind !== "ai_fix" && row.kind !== "ai_redraft") return row;
    if (row.content === "") return row;
    return { ...row, content: "" };
  });
}

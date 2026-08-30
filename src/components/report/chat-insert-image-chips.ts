/** Tool-chip shape used to collapse duplicate insert_image lines in one turn. */
export type InsertImageChipInfo = {
  toolName: string;
  output?: { status?: string } | null;
  input?: {
    section?: unknown;
    targetField?: unknown;
    image?: { analysisId?: unknown } | null;
  } | null;
};

function analyticsId(info: InsertImageChipInfo): string | null {
  const id = info.input?.image?.analysisId;
  return typeof id === "string" && id.trim() ? id : null;
}

/**
 * The model often fires insert_image many times in one step. Keep one
 * "available plots" line, and one chip per Analytics plot + destination.
 */
export function isRedundantInsertImageChip(
  seen: readonly InsertImageChipInfo[],
  current: InsertImageChipInfo
): boolean {
  if (current.toolName !== "insert_image") return false;
  if (current.output?.status === "available_plots") {
    return seen.some(
      (prev) =>
        prev.toolName === "insert_image" &&
        prev.output?.status === "available_plots"
    );
  }
  const id = analyticsId(current);
  if (!id) return false;
  return seen.some((prev) => {
    if (prev.toolName !== "insert_image") return false;
    if (prev.output?.status === "available_plots") return false;
    return (
      analyticsId(prev) === id &&
      prev.input?.section === current.input?.section &&
      prev.input?.targetField === current.input?.targetField
    );
  });
}

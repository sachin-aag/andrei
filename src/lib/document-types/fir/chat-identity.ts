import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";

function metaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string {
  if (!metadata || typeof metadata !== "object") return "";
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function identityValue(value: string, max = 120): string {
  return sanitizePromptMetadata(value, max);
}

/**
 * An unset identity field is the one the model is most likely to fill from the
 * first attachment hit. MJ runs `unsupportedFactPolicy: "block"`, so a batch
 * number lifted off a neighbouring PRQR would be a blocked write at best and a
 * wrong investigated batch at worst — say "(unset)" out loud instead.
 */
const UNSET_NOTE =
  "(unset) — ask the engineer; do not take this from an attachment";

/**
 * Compact identity lines for the chat context map. These are the R01 header
 * fields: they live in `reports.metadata`, not in a drafted section, so chat
 * cannot read them out of the document itself.
 */
export function firChatContextIdentity(
  metadata: Record<string, unknown> | null | undefined
): readonly string[] {
  const line = (label: string, key: string) => {
    const value = identityValue(metaString(metadata, key));
    return `${label}: ${value || UNSET_NOTE}`;
  };

  return [
    line("unit", "unit"),
    line("date of non-conformance", "dateOfNonConformance"),
    line("source document no.", "sourceDocumentNo"),
    line("product", "productName"),
    line("batch under investigation", "batchNo"),
    line("equipment ID", "equipmentId"),
    `reference SOP: ${identityValue(metaString(metadata, "referenceSopNo")) || "SOP/QA/017"} form F01 R01`,
    "This is the Drug Substance investigation form. Do not draft Define / Measure / Analyze / Improve / Control sections.",
  ];
}

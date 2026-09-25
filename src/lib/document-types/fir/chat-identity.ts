import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import type { ChatIdentityField } from "@/lib/document-types/types";

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
 * An unset identity field used to tell the model not to lift a neighbouring
 * PRQR's batch. Search attachments and write with draft_identity instead.
 */
const UNSET_NOTE =
  "(unset) — search attachments and call draft_identity";

export const FIR_IDENTITY_LABEL = "Header identity";

export const FIR_IDENTITY_FIELDS: readonly ChatIdentityField[] = [
  {
    key: "documentNo",
    label: "Source Document No.",
    storage: "documentNo",
    alsoMetadataKey: "sourceDocumentNo",
    required: true,
  },
  {
    key: "date",
    label: "Date of non-conformance",
    storage: "date",
    alsoMetadataKey: "dateOfNonConformance",
    required: true,
  },
  {
    key: "productName",
    label: "Product name",
    storage: "metadata",
    metadataKey: "productName",
    required: true,
  },
  {
    key: "batchNo",
    label: "Batch No.",
    storage: "metadata",
    metadataKey: "batchNo",
    required: true,
  },
  {
    key: "equipmentId",
    label: "Equipment ID",
    storage: "metadata",
    metadataKey: "equipmentId",
  },
  {
    key: "unit",
    label: "Unit",
    storage: "metadata",
    metadataKey: "unit",
  },
  {
    key: "referenceSopNo",
    label: "Reference SOP No.",
    storage: "metadata",
    metadataKey: "referenceSopNo",
  },
];

/**
 * Compact identity lines for the chat context map. These are the R01 header
 * fields: they live in `reports.metadata`, not in a drafted section.
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
    "This is the Drug Substance investigation form. Do not draft Define / Measure / Analyze / Improve / Control sections. Fill header identity with draft_identity from attachments. Header scalars never include citations.",
  ];
}

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

const UNSET_NOTE =
  "(unset) — search attachments and call draft_identity";

export const QRA_IDENTITY_LABEL = "Header identity";

export const QRA_IDENTITY_FIELDS: readonly ChatIdentityField[] = [
  {
    key: "documentNo",
    label: "RA Number",
    storage: "documentNo",
    required: true,
  },
  {
    key: "date",
    label: "Date",
    storage: "date",
  },
  {
    key: "title",
    label: "Title",
    storage: "metadata",
    metadataKey: "title",
    required: true,
  },
  {
    key: "productName",
    label: "Product / process / equipment",
    storage: "metadata",
    metadataKey: "productName",
    required: true,
  },
  {
    key: "revision",
    label: "Revision",
    storage: "metadata",
    metadataKey: "revision",
  },
  {
    key: "department",
    label: "Department",
    storage: "metadata",
    metadataKey: "department",
  },
  {
    key: "idNo",
    label: "ID No.",
    storage: "metadata",
    metadataKey: "idNo",
  },
  {
    key: "sourceDocumentName",
    label: "Source document name",
    storage: "metadata",
    metadataKey: "sourceDocumentName",
  },
  {
    key: "sourceDocumentNo",
    label: "Source document no.",
    storage: "metadata",
    metadataKey: "sourceDocumentNo",
  },
];

export function qraChatContextIdentity(
  metadata: Record<string, unknown> | null | undefined
): readonly string[] {
  const line = (label: string, key: string) => {
    const raw = metaString(metadata, key);
    const value = sanitizePromptMetadata(raw, 120);
    return `${label}: ${value || UNSET_NOTE}`;
  };
  return [
    line("title", "title"),
    line("product / process / equipment", "productName"),
    line("department", "department"),
    line("ID no.", "idNo"),
    line("source document name", "sourceDocumentName"),
    line("source document no.", "sourceDocumentNo"),
    `revision: ${sanitizePromptMetadata(metaString(metadata, "revision"), 20) || "R00"}`,
    "Fill header identity with draft_identity from attachments. Header scalars never include citations. Do not draft signature placeholders (pre/post approval).",
  ];
}

import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import type { ChatIdentityField } from "@/lib/document-types/types";
import { CVP_FORM_NO, cvpMetadataFrom } from "./sections";

const UNSET_NOTE = "(unset) — search attachments and call draft_identity";

export const CVP_IDENTITY_LABEL = "Cover identity";

export const CVP_IDENTITY_FIELDS: readonly ChatIdentityField[] = [
  {
    key: "documentNo",
    label: "Protocol No.",
    storage: "documentNo",
    required: true,
  },
  {
    key: "productName",
    label: "Name of the product",
    storage: "metadata",
    metadataKey: "productName",
    required: true,
  },
  {
    key: "productCode",
    label: "Product Code",
    storage: "metadata",
    metadataKey: "productCode",
    required: true,
  },
  {
    key: "stage",
    label: "Stage",
    storage: "metadata",
    metadataKey: "stage",
    required: true,
  },
  {
    key: "plant",
    label: "Plant",
    storage: "metadata",
    metadataKey: "plant",
    required: true,
  },
  {
    key: "department",
    label: "Department",
    storage: "metadata",
    metadataKey: "department",
  },
  {
    key: "documentTitle",
    label: "Document Title",
    storage: "metadata",
    metadataKey: "documentTitle",
  },
  {
    key: "version",
    label: "Version",
    storage: "metadata",
    metadataKey: "version",
  },
  {
    key: "effectiveDate",
    label: "Effective Date",
    storage: "metadata",
    metadataKey: "effectiveDate",
  },
  {
    key: "reportNo",
    label: "Report No.",
    storage: "metadata",
    metadataKey: "reportNo",
  },
];

/** Header identity lines; they live in `reports.metadata`, not in a section. */
export function cvpChatContextIdentity(
  metadata: Record<string, unknown> | null | undefined
): readonly string[] {
  const meta = cvpMetadataFrom(metadata);
  const line = (label: string, value: string) =>
    `${label}: ${sanitizePromptMetadata(value, 120) || UNSET_NOTE}`;
  return [
    line("product", meta.productName),
    line("product code", meta.productCode),
    line("stage", meta.stage),
    line("plant", meta.plant),
    line("department", meta.department),
    `form: ${CVP_FORM_NO} version ${sanitizePromptMetadata(meta.version, 20) || "00"}`,
    line("report no.", meta.reportNo),
    "This is a Cleaning Validation Protocol. Numbered headings, the running header, footer Format No., and approval chrome are fixed by the form — do not draft those as section titles. Fill cover identity (product, code, stage, plant, protocol no.) with draft_identity from attachments. Report No. stays blank on the protocol. Cover scalars never include citations. Result tables use a grouped Results header over three blank batch columns; execution cells stay blank. Do not copy Stage-5 report verdicts (Validated, results later, unfinished AMV) into this protocol.",
  ];
}

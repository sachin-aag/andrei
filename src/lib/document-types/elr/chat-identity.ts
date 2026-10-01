import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import type { ChatIdentityField } from "@/lib/document-types/types";
import {
  canonicalElrPeriod,
  ELR_FY_PERIOD_RULE,
} from "@/lib/document-types/elr/financial-year";

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

const UNSET_NOTE =
  "(unset) — search attachments and call draft_identity";

const UNSET_FORMAT_NOTE =
  "(unset) — one ELR per format. If attachments name both Vial and Cartridge, call ask_user which format this ELR covers before draft_identity or draft_field on Scope or any format-scoped table. Do not pick the first PRQR.";

export const ELR_IDENTITY_LABEL = "Title-page identity";

export const ELR_IDENTITY_FIELDS: readonly ChatIdentityField[] = [
  {
    key: "documentNo",
    label: "ELR Report No.",
    storage: "documentNo",
    required: true,
  },
  {
    key: "equipmentName",
    label: "Equipment name",
    storage: "metadata",
    metadataKey: "equipmentName",
    required: true,
  },
  {
    key: "equipmentId",
    label: "Equipment ID",
    storage: "metadata",
    metadataKey: "equipmentId",
    required: true,
  },
  {
    key: "formatScope",
    label: "Container format / product scope",
    storage: "metadata",
    metadataKey: "formatScope",
    required: true,
  },
  {
    key: "equipmentMake",
    label: "Equipment make",
    storage: "metadata",
    metadataKey: "equipmentMake",
  },
  {
    key: "equipmentModel",
    label: "Equipment model",
    storage: "metadata",
    metadataKey: "equipmentModel",
  },
  {
    key: "systemId",
    label: "Associated computerized system / ID",
    storage: "metadata",
    metadataKey: "systemId",
  },
  {
    key: "location",
    label: "Location / area",
    storage: "metadata",
    metadataKey: "location",
  },
  {
    key: "department",
    label: "Department",
    storage: "metadata",
    metadataKey: "department",
  },
  {
    key: "riskClassification",
    label: "System impact (SLIA)",
    storage: "metadata",
    metadataKey: "riskClassification",
  },
  {
    key: "elrFrequency",
    label: "ELR frequency (per VMP)",
    storage: "metadata",
    metadataKey: "elrFrequency",
  },
  {
    key: "cycleNo",
    label: "ELR Cycle No.",
    storage: "metadata",
    metadataKey: "cycleNo",
  },
  {
    key: "periodFrom",
    label: "ELR period — from",
    storage: "metadata",
    metadataKey: "periodFrom",
  },
  {
    key: "periodTo",
    label: "ELR period — to",
    storage: "metadata",
    metadataKey: "periodTo",
  },
  {
    key: "lastPrqNo",
    label: "Last PRQ No.",
    storage: "metadata",
    metadataKey: "lastPrqNo",
  },
  {
    key: "lastPrqDate",
    label: "Last PRQ completion date",
    storage: "metadata",
    metadataKey: "lastPrqDate",
  },
  {
    key: "nextPrqDate",
    label: "Next PRQ due date",
    storage: "metadata",
    metadataKey: "nextPrqDate",
  },
  {
    key: "revision",
    label: "Revision",
    storage: "metadata",
    metadataKey: "revision",
  },
];

function periodLine(
  metadata: Record<string, unknown> | null | undefined
): string {
  const window = canonicalElrPeriod({
    periodFrom: metaString(metadata, "periodFrom"),
    periodTo: metaString(metadata, "periodTo"),
    lastPrqDate: metaString(metadata, "lastPrqDate"),
    lastPrqNo: metaString(metadata, "lastPrqNo"),
  });
  if (window) {
    return `period: ${window.fromLabel} – ${window.toLabel} (${ELR_FY_PERIOD_RULE})`;
  }
  return `period: (unset) — ${ELR_FY_PERIOD_RULE} Infer from last PRQ or document FY digits (PRQR-25 → 1 April 2025 – 31 March 2026).`;
}

/**
 * Compact title-page lines for the chat context map. Format is the fork
 * that Agent previously inferred from the first PRQR hit.
 */
export function elrChatContextIdentity(
  metadata: Record<string, unknown> | null | undefined
): readonly string[] {
  const equipmentName = identityValue(metaString(metadata, "equipmentName"));
  const equipmentId = identityValue(metaString(metadata, "equipmentId"));
  const format = identityValue(metaString(metadata, "formatScope"), 40);

  const formatLine = format
    ? `container format: ${format} — use this; do not switch based on attachments`
    : `container format: ${UNSET_FORMAT_NOTE}`;

  return [
    `equipment name: ${equipmentName || UNSET_NOTE}`,
    `equipment ID: ${equipmentId || UNSET_NOTE}`,
    formatLine,
    periodLine(metadata),
    "format number: SOP/DP/QA/014/F22-R00 (proposed)",
    "Fill title-page identity with draft_identity from attachments. Header scalars never include citations.",
  ];
}

import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
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

const UNSET_FORMAT_NOTE =
  "(unset) — one ELR per format. If attachments name both Vial and Cartridge, call ask_user which format this ELR covers before draft_field on Scope or any format-scoped table. Do not pick the first PRQR.";

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
    `equipment name: ${equipmentName || "(unset)"}`,
    `equipment ID: ${equipmentId || "(unset)"}`,
    formatLine,
    periodLine(metadata),
    "format number: SOP/DP/QA/014/F22-R00 (proposed)",
  ];
}

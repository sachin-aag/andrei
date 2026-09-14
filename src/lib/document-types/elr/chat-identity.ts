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

const UNSET_FORMAT_NOTE =
  "(unset) — one ELR per format. If attachments name both Vial and Cartridge, call ask_user which format this ELR covers before draft_field on Scope or any format-scoped table. Do not pick the first PRQR.";

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
  const periodFrom = identityValue(metaString(metadata, "periodFrom"), 40);
  const periodTo = identityValue(metaString(metadata, "periodTo"), 40);

  const formatLine = format
    ? `container format: ${format} — use this; do not switch based on attachments`
    : `container format: ${UNSET_FORMAT_NOTE}`;

  return [
    `equipment name: ${equipmentName || "(unset)"}`,
    `equipment ID: ${equipmentId || "(unset)"}`,
    formatLine,
    `period: ${periodFrom || "(unset)"} – ${periodTo || "(unset)"}`,
  ];
}

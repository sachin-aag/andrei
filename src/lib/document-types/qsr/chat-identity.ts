import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import { qsrMetadataFrom } from "./sections";

const UNSET_NOTE = "(unset) — ask the engineer; do not take this from an attachment";

/** Header identity lines; they live in `reports.metadata`, not in a section. */
export function qsrChatContextIdentity(
  metadata: Record<string, unknown> | null | undefined
): readonly string[] {
  const meta = qsrMetadataFrom(metadata);
  const line = (label: string, value: string) =>
    `${label}: ${sanitizePromptMetadata(value, 120) || UNSET_NOTE}`;
  return [
    line("equipment/system", meta.equipmentName),
    line("equipment number", meta.equipmentCode),
    line("capacity/size", meta.capacity),
    line("plant section", meta.plantSection),
    `form: QAD/016/F06-00 revision ${sanitizePromptMetadata(meta.revision, 20) || "00"}`,
    "This is the Qualification Summary Report. Headings, cover, sign-off, revision history and Index are fixed by the form — do not draft them.",
  ];
}

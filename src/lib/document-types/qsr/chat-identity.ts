import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import type { ChatIdentityField } from "@/lib/document-types/types";
import { qsrMetadataFrom } from "./sections";

const UNSET_NOTE =
  "(unset) — search attachments and call draft_identity";

export const QSR_IDENTITY_LABEL = "Cover identity";

export const QSR_IDENTITY_FIELDS: readonly ChatIdentityField[] = [
  {
    key: "documentNo",
    label: "Report No.",
    storage: "documentNo",
    required: true,
  },
  {
    key: "equipmentName",
    label: "Equipment / System",
    storage: "metadata",
    metadataKey: "equipmentName",
    required: true,
  },
  {
    key: "equipmentCode",
    label: "Equipment Number",
    storage: "metadata",
    metadataKey: "equipmentCode",
    required: true,
  },
  {
    key: "capacity",
    label: "Capacity / Size",
    storage: "metadata",
    metadataKey: "capacity",
    required: true,
  },
  {
    key: "plantSection",
    label: "Section",
    storage: "metadata",
    metadataKey: "plantSection",
    required: true,
  },
  {
    key: "revision",
    label: "Revision",
    storage: "metadata",
    metadataKey: "revision",
  },
  {
    key: "revisionDescription",
    label: "Revision description",
    storage: "metadata",
    metadataKey: "revisionDescription",
  },
];

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
    "This is the Qualification Summary Report. Headings, sign-off, revision history and Index are fixed by the form — do not draft those. Fill cover identity (equipment, report no., revision) with draft_identity from attachments.",
  ];
}

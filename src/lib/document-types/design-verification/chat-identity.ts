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

export const DV_IDENTITY_LABEL = "Cover page";

export const DV_IDENTITY_FIELDS: readonly ChatIdentityField[] = [
  {
    key: "documentNo",
    label: "Document Number",
    storage: "documentNo",
    required: true,
  },
  {
    key: "productName",
    label: "Product Name",
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
];

export function dvChatContextIdentity(
  metadata: Record<string, unknown> | null | undefined
): readonly string[] {
  const product = sanitizePromptMetadata(
    metaString(metadata, "productName"),
    120
  );
  const revision = sanitizePromptMetadata(metaString(metadata, "revision"), 40);
  return [
    `product name: ${product || UNSET_NOTE}`,
    `revision: ${revision || UNSET_NOTE}`,
    "Fill cover-page identity with draft_identity from attachments. Do not draft the cover as a prose section. Cover scalars never include citations.",
  ];
}

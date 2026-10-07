import type { SectionType } from "@/db/schema";
import { fieldFillState } from "@/lib/ai/chat/fields";
import { cvpEquipmentItemIndexFromTarget } from "@/lib/document-types/cvp/equipment-item-path";
import {
  CVP_EQUIPMENT_SAMPLING_SECTION,
  ensureCvpEquipmentItem,
  normalizeCvpEquipmentSamplingContent,
} from "@/lib/document-types/cvp/equipment-sampling";

function isCvpEquipmentGenericTarget(requested: string): boolean {
  return (
    requested === "narrative" ||
    requested === "table" ||
    requested === CVP_EQUIPMENT_SAMPLING_SECTION
  );
}

function firstEmptyCvpEquipmentItemIndex(
  content: Record<string, unknown>
): number | null {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  for (let i = 0; i < items.length; i++) {
    if (
      fieldFillState(content, CVP_EQUIPMENT_SAMPLING_SECTION, `items.${i}`) ===
      "empty"
    ) {
      return i;
    }
  }
  return null;
}

export type CvpEquipmentWriteRoute = {
  targetField: string;
  content: Record<string, unknown>;
};

/**
 * Route a write onto the right 15.N box.
 * Explicit `items.N` / `15.N` keep that index (creating the box if missing).
 * Generic `narrative` / `table` / section key go to the first empty box, or
 * append a new 15.N seed when every existing box is filled.
 */
export function routeCvpEquipmentWriteField(args: {
  requestedField: string;
  resolvedField: string;
  content: Record<string, unknown>;
  preferEmptyItem?: boolean;
}): CvpEquipmentWriteRoute {
  const preferEmptyItem = args.preferEmptyItem !== false;
  let index = cvpEquipmentItemIndexFromTarget(args.requestedField);
  if (
    index == null &&
    preferEmptyItem &&
    isCvpEquipmentGenericTarget(args.requestedField)
  ) {
    index = firstEmptyCvpEquipmentItemIndex(args.content);
    if (index == null) {
      index = normalizeCvpEquipmentSamplingContent(args.content).items.length;
    }
  }
  if (index == null) {
    index = cvpEquipmentItemIndexFromTarget(args.resolvedField) ?? 0;
  }
  return {
    targetField: `items.${index}`,
    content: ensureCvpEquipmentItem(args.content, index),
  };
}

/** A tagged 15.N box wins over generic `narrative` / `table` / a sibling items.N. */
export function preferTaggedCvpEquipmentField(
  section: SectionType,
  requestedField: string,
  taggedItemField: string | undefined
): string {
  if (section !== CVP_EQUIPMENT_SAMPLING_SECTION) return requestedField;
  return taggedItemField ?? requestedField;
}

export function bindCvpEquipmentWrite(
  section: SectionType,
  requestedField: string,
  resolvedField: string,
  content: Record<string, unknown>,
  opts?: { preferEmptyItem?: boolean; taggedItemField?: string }
): CvpEquipmentWriteRoute {
  if (section !== CVP_EQUIPMENT_SAMPLING_SECTION) {
    return { targetField: resolvedField, content };
  }
  const requested = preferTaggedCvpEquipmentField(
    section,
    requestedField,
    opts?.taggedItemField
  );
  return routeCvpEquipmentWriteField({
    requestedField: requested,
    resolvedField,
    content,
    preferEmptyItem: opts?.preferEmptyItem,
  });
}

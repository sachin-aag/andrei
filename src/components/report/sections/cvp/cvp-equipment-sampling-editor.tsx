"use client";

import type { JSONContent } from "@tiptap/core";
import { Plus, Trash2 } from "lucide-react";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import { Button } from "@/components/ui/button";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  appendCvpEquipmentItem,
  cvpEquipmentItemAnchor,
  cvpEquipmentItemTitle,
  insertBlankCvpEquipmentItem,
  normalizeCvpEquipmentSamplingContent,
  removeCvpEquipmentItem,
  type CvpEquipmentSamplingContent,
} from "@/lib/document-types/cvp/equipment-sampling";
import { CVP_SECTION_LABELS } from "@/lib/document-types/cvp/sections";
import { emptyDoc } from "@/lib/tiptap/rich-text";
import { useGenericReportSection } from "@/providers/report-provider";

const SECTION = "cvp_equipment_sampling" as const;

export function CvpEquipmentSamplingEditor() {
  const { update } = useGenericReportSection<CvpEquipmentSamplingContent>(SECTION);
  const { status, lastSavedAt, value, flushSave } = useGenericSectionSave(SECTION);
  const { items } = normalizeCvpEquipmentSamplingContent(value);

  const write = (nextItems: JSONContent[]) => {
    update(() => ({ items: nextItems }));
  };

  return (
    <SectionShell
      title={CVP_SECTION_LABELS[SECTION]}
      description="One box per product-contact equipment. Add equipment for a blank 15.2, 15.3, … box — numbering and Contents update automatically."
      status={status}
      lastSavedAt={lastSavedAt}
      section={SECTION}
    >
      <div className="grid gap-6">
        {items.map((doc, index) => (
          <CvpEquipmentItemCard
            key={cvpEquipmentItemAnchor(index)}
            index={index}
            doc={doc}
            canRemove={items.length > 1}
            onChange={(next) => {
              const nextItems = items.slice();
              nextItems[index] = next;
              write(nextItems);
            }}
            onAddEquipment={() => write(insertBlankCvpEquipmentItem(items, index))}
            onRemove={() => write(removeCvpEquipmentItem(items, index))}
            onFlushSave={flushSave}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => write(appendCvpEquipmentItem(items))}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add equipment
        </Button>
      </div>
    </SectionShell>
  );
}

function CvpEquipmentItemCard({
  index,
  doc,
  canRemove,
  onChange,
  onAddEquipment,
  onRemove,
  onFlushSave,
}: {
  index: number;
  doc: JSONContent;
  canRemove: boolean;
  onChange: (next: JSONContent) => void;
  onAddEquipment: () => void;
  onRemove: () => void;
  onFlushSave: () => void;
}) {
  const ordinal = index + 1;
  const title = cvpEquipmentItemTitle(doc, ordinal);
  return (
    <div
      id={cvpEquipmentItemAnchor(index)}
      className="grid gap-2 rounded-lg border border-[var(--border)] p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAddEquipment}
            title="Add a blank equipment box after this one"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add equipment
          </Button>
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              title="Remove this equipment box"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <TiptapSectionField
        section={SECTION}
        contentPath={`items.${index}`}
        label="Content"
        placeholder="Write this equipment’s sampling plan, or leave blank for Agent to draft…"
        className="grid gap-2"
        value={doc ?? emptyDoc()}
        onChange={onChange}
        onFlushSave={onFlushSave}
      />
    </div>
  );
}

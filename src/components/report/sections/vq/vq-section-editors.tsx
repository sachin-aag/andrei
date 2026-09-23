"use client";

import type { ComponentType } from "react";
import type { JSONContent } from "@tiptap/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionShell } from "@/components/report/sections/section-shell";
import { TiptapSectionField } from "@/components/report/tiptap-section-field";
import {
  useGenericReportSection,
  useReportData,
} from "@/providers/report-provider";
import { useGenericSectionSave } from "@/hooks/use-generic-section-save";
import {
  VQ_DEFAULT_CONTACTS,
  VQ_FORM,
  vqFieldCaption,
  type VqField,
  type VqFieldKind,
} from "@/lib/document-types/vq/schema";
import {
  EMPTY_VQ_CONTENT,
  VQ_SECTION_KEYS,
  VQ_SECTION_LABELS,
  fieldRefId,
  parseVqChoice,
  type VqSectionContent,
  type VqSectionKey,
} from "@/lib/document-types/vq/sections";

const TABLE_PLACEHOLDER =
  "Use the table toolbar to add rows. Keep the header columns unchanged.";

/** Shared Label is uppercase tracking-wide — wrong for full questionnaire questions. */
const QUESTION_LABEL_CLASS =
  "normal-case tracking-normal text-sm font-medium leading-snug text-[var(--foreground)]";

function coverPlaceholder(fieldId: string): string | undefined {
  switch (fieldId) {
    case "cover_contact_name":
      return VQ_DEFAULT_CONTACTS.contactName;
    case "cover_contact_title":
      return VQ_DEFAULT_CONTACTS.contactTitle;
    case "cover_contact_site":
      return VQ_DEFAULT_CONTACTS.contactSite;
    case "cover_contact_address":
      return VQ_DEFAULT_CONTACTS.contactAddress;
    case "cover_contact_phone":
      return VQ_DEFAULT_CONTACTS.contactPhone;
    case "cover_contact_email":
      return VQ_DEFAULT_CONTACTS.contactEmail;
    default:
      return undefined;
  }
}

function choiceOptions(kind: VqFieldKind): ReadonlyArray<"yes" | "no" | "na"> {
  switch (kind) {
    case "yes_no":
      return ["yes", "no"];
    case "yes_no_na":
    case "yes_no_na_ref":
      return ["yes", "no", "na"];
    case "text":
    case "textarea":
      return [];
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function choiceLabel(value: "yes" | "no" | "na"): string {
  switch (value) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "na":
      return "N.A.";
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}

function ChoiceRow({
  field,
  value,
  disabled,
  onChange,
}: {
  field: VqField;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const selected = parseVqChoice(value);
  return (
    <div className="flex flex-wrap gap-3">
      {choiceOptions(field.kind).map((option) => (
        <label key={option} className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={field.id}
            value={option}
            checked={selected === option}
            disabled={disabled}
            onChange={() => onChange(option)}
          />
          {choiceLabel(option)}
        </label>
      ))}
    </div>
  );
}

function FieldControl({
  field,
  answers,
  disabled,
  onAnswer,
}: {
  field: VqField;
  answers: Record<string, string>;
  disabled: boolean;
  onAnswer: (id: string, value: string) => void;
}) {
  const value = answers[field.id] ?? "";
  if (field.kind === "text") {
    return (
      <Input
        id={field.id}
        value={value}
        disabled={disabled}
        placeholder={coverPlaceholder(field.id)}
        onChange={(event) => onAnswer(field.id, event.target.value)}
      />
    );
  }
  if (field.kind === "textarea") {
    return (
      <Textarea
        id={field.id}
        value={value}
        disabled={disabled}
        placeholder={coverPlaceholder(field.id)}
        onChange={(event) => onAnswer(field.id, event.target.value)}
      />
    );
  }
  return (
    <div className="space-y-2">
      <ChoiceRow
        field={field}
        value={value}
        disabled={disabled}
        onChange={(next) => onAnswer(field.id, next)}
      />
      {field.kind === "yes_no_na_ref" ? (
        <Input
          value={answers[fieldRefId(field.id)] ?? ""}
          disabled={disabled}
          placeholder="Ref / attachment number"
          onChange={(event) =>
            onAnswer(fieldRefId(field.id), event.target.value)
          }
        />
      ) : null}
    </div>
  );
}

function VqQuestionnaireEditor({ section }: { section: VqSectionKey }) {
  const spec = VQ_FORM[section];
  const { update } = useGenericReportSection<VqSectionContent>(section);
  const { status, lastSavedAt, value, flushSave } =
    useGenericSectionSave(section);
  const { readOnly } = useReportData();
  const content = (value as VqSectionContent | undefined) ??
    EMPTY_VQ_CONTENT[section];
  const answers = content.answers ?? {};

  const onAnswer = (id: string, next: string) => {
    update((prev) => ({
      ...prev,
      answers: { ...prev.answers, [id]: next },
    }));
  };

  return (
    <SectionShell
      title={VQ_SECTION_LABELS[section]}
      description={spec?.instruction}
      status={status}
      lastSavedAt={lastSavedAt}
      section={section}
    >
      {spec?.groups.map((group) => (
        <div key={group.title} className="space-y-3">
          <h3 className="text-sm font-semibold">{group.title}</h3>
          {group.note ? (
            <p className="text-sm text-[var(--muted-foreground)]">{group.note}</p>
          ) : null}
          <div className="space-y-4">
            {group.fields.map((field) => (
              <div
                key={field.id}
                className="grid gap-1.5"
                data-testid={`vq-field-${field.id}`}
              >
                <Label
                  htmlFor={
                    field.kind === "text" || field.kind === "textarea"
                      ? field.id
                      : undefined
                  }
                  className={QUESTION_LABEL_CLASS}
                >
                  {vqFieldCaption(field)}
                </Label>
                <FieldControl
                  field={field}
                  answers={answers}
                  disabled={readOnly}
                  onAnswer={onAnswer}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {spec?.narrativeLabel ? (
        <TiptapSectionField
          section={section}
          contentPath="narrative"
          label={spec.narrativeLabel}
          placeholder="Write comments or the conclusion…"
          className="grid gap-2"
          value={content.narrative as JSONContent}
          onChange={(doc) => update((prev) => ({ ...prev, narrative: doc }))}
          onFlushSave={flushSave}
        />
      ) : null}
      {spec?.matrix ? (
        <TiptapSectionField
          section={section}
          contentPath="table"
          label="Table"
          placeholder={TABLE_PLACEHOLDER}
          className="grid gap-2"
          value={content.table as JSONContent}
          onChange={(doc) => update((prev) => ({ ...prev, table: doc }))}
          onFlushSave={flushSave}
        />
      ) : null}
    </SectionShell>
  );
}

function makeEditor(section: VqSectionKey): ComponentType {
  function Editor() {
    return <VqQuestionnaireEditor section={section} />;
  }
  Editor.displayName = `VqEditor_${section}`;
  return Editor;
}

export const VQ_SECTION_EDITORS: Record<VqSectionKey, ComponentType> =
  Object.fromEntries(
    VQ_SECTION_KEYS.map((key) => [key, makeEditor(key)])
  ) as Record<VqSectionKey, ComponentType>;

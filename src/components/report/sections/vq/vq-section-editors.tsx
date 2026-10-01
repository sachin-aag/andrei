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
import { Button } from "@/components/ui/button";
import {
  VQ_DEFAULT_CONTACTS,
  VQ_FORM,
  VQ_PAGE_SIGNATURE_HEADERS,
  vqFieldCaption,
  vqGridCellId,
  type VqField,
  type VqFieldKind,
  type VqGroup,
} from "@/lib/document-types/vq/schema";
import {
  EMPTY_VQ_CONTENT,
  VQ_PAGE_SIGNATURE_COLUMNS,
  VQ_SECTION_KEYS,
  VQ_SECTION_LABELS,
  emptyVqPageSignatureRow,
  fieldRefId,
  parseVqPageSignatures,
  type VqPageSignatureRow,
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

type ChoiceOption = { value: string; label: string };

/** Radio options for single-answer kinds; empty for everything else. */
function choiceOptions(field: VqField, naLabel = "N.A."): ChoiceOption[] {
  const yes = { value: "yes", label: "Yes" };
  const no = { value: "no", label: "No" };
  const na = { value: "na", label: naLabel };
  const kind: VqFieldKind = field.kind;
  switch (kind) {
    case "yes_no":
      return [yes, no];
    case "yes_no_na":
    case "yes_no_na_ref":
    case "yes_ref_no_na":
      return [yes, no, na];
    case "enclosed_ref_na":
      return [{ value: "yes", label: "Enclosed" }, na];
    case "choice":
      return [...(field.options ?? [])];
    case "text":
    case "textarea":
    case "ref":
    case "ref_note":
    case "checks":
    case "check":
    case "label":
    case "static":
    case "grid":
      return [];
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** Kinds that also carry a `Ref:` / comment text in `${id}__ref`. */
function hasRefText(kind: VqFieldKind): boolean {
  return (
    kind === "yes_no_na_ref" ||
    kind === "yes_ref_no_na" ||
    kind === "enclosed_ref_na"
  );
}

function isTicked(value: string | undefined): boolean {
  return value === "yes";
}

function ChoiceRow({
  field,
  value,
  naLabel,
  disabled,
  onChange,
}: {
  field: VqField;
  value: string;
  naLabel?: string;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {choiceOptions(field, naLabel).map((option) => (
        <label key={option.value} className="flex items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={field.id}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function TickBox({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function refPlaceholder(kind: VqFieldKind): string {
  return kind === "yes_no_na_ref" ? "Comments / reference" : "Ref / attachment number";
}

function FieldControl({
  field,
  group,
  answers,
  disabled,
  onAnswer,
}: {
  field: VqField;
  group: VqGroup;
  answers: Record<string, string>;
  disabled: boolean;
  onAnswer: (id: string, value: string) => void;
}) {
  const value = answers[field.id] ?? "";
  switch (field.kind) {
    case "label":
      return null;
    case "static":
      return <p className="text-sm font-semibold">{field.value}</p>;
    case "text":
      return (
        <div className="flex items-center gap-2">
          {field.prefix ? <span className="text-sm">{field.prefix}</span> : null}
          <Input
            id={field.id}
            value={value}
            disabled={disabled}
            placeholder={coverPlaceholder(field.id)}
            onChange={(event) => onAnswer(field.id, event.target.value)}
          />
          {field.suffix ? <span className="text-sm">{field.suffix}</span> : null}
        </div>
      );
    case "textarea":
      return (
        <Textarea
          id={field.id}
          value={value}
          disabled={disabled}
          placeholder={coverPlaceholder(field.id)}
          onChange={(event) => onAnswer(field.id, event.target.value)}
        />
      );
    case "ref":
    case "ref_note":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            id={field.id}
            aria-label="Ref"
            value={value || (answers[fieldRefId(field.id)] ?? "")}
            disabled={disabled}
            placeholder="Ref / attachment number"
            onChange={(event) => onAnswer(field.id, event.target.value)}
          />
          {field.kind === "ref_note" ? (
            <Input
              aria-label="Reference note"
              value={answers[`${field.id}__note`] ?? ""}
              disabled={disabled}
              placeholder="Reference note"
              onChange={(event) =>
                onAnswer(`${field.id}__note`, event.target.value)
              }
            />
          ) : null}
        </div>
      );
    case "checks":
      return (
        <div
          className={
            field.vertical ? "grid gap-1.5" : "flex flex-wrap gap-x-4 gap-y-1.5"
          }
        >
          {(field.checks ?? []).map((option) => (
            <TickBox
              key={option.id}
              id={option.id}
              label={option.label}
              checked={isTicked(answers[option.id])}
              disabled={disabled}
              onChange={(next) => onAnswer(option.id, next ? "yes" : "")}
            />
          ))}
        </div>
      );
    case "check":
      return (
        <TickBox
          id={field.id}
          label={field.detail ?? field.label}
          checked={isTicked(value)}
          disabled={disabled}
          onChange={(next) => onAnswer(field.id, next ? "yes" : "")}
        />
      );
    case "grid": {
      const columns = field.columns ?? [];
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {columns.map((heading) => (
                  <th
                    key={heading}
                    className="border border-[var(--border)] px-2 py-1 text-left font-medium"
                  >
                    {heading.replace("\n", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: field.rows ?? 0 }, (_, r) => (
                <tr key={r}>
                  {columns.map((heading, c) => {
                    const id = vqGridCellId(field.id, r, c);
                    return (
                      <td key={heading} className="border border-[var(--border)] p-1">
                        <Input
                          aria-label={`${heading} row ${r + 1}`}
                          value={answers[id] ?? ""}
                          disabled={disabled}
                          onChange={(event) => onAnswer(id, event.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "yes_no":
    case "yes_no_na":
    case "yes_no_na_ref":
    case "yes_ref_no_na":
    case "enclosed_ref_na":
    case "choice":
      return (
        <div className="space-y-2">
          <ChoiceRow
            field={field}
            value={value}
            naLabel={group.naLabel}
            disabled={disabled}
            onChange={(next) => onAnswer(field.id, next)}
          />
          {hasRefText(field.kind) ? (
            <Input
              aria-label={refPlaceholder(field.kind)}
              value={answers[fieldRefId(field.id)] ?? ""}
              disabled={disabled}
              placeholder={refPlaceholder(field.kind)}
              onChange={(event) =>
                onAnswer(fieldRefId(field.id), event.target.value)
              }
            />
          ) : null}
        </div>
      );
    default: {
      const exhaustive: never = field.kind;
      return exhaustive;
    }
  }
}

/** Group heading as printed on the form (`1.2 Is the address…`). */
function groupHeading(group: VqGroup): string {
  const title = group.title.replace(/^\*\s*/, "");
  return group.number ? `${group.number} ${title}` : title;
}

/** Lead rows (A 1.2 / 1.3) ask the banner question; the caption is its follow-up. */
function fieldCaption(field: VqField, group: VqGroup): string {
  if (field.lead) return groupHeading(group);
  return vqFieldCaption(field);
}

function PageSignaturesEditor({
  rows,
  disabled,
  onChange,
}: {
  rows: VqPageSignatureRow[];
  disabled: boolean;
  onChange: (next: VqPageSignatureRow[]) => void;
}) {
  const setCell = (
    index: number,
    column: keyof VqPageSignatureRow,
    value: string
  ) => {
    onChange(
      rows.map((row, i) => (i === index ? { ...row, [column]: value } : row))
    );
  };
  return (
    <div className="space-y-3" data-testid="vq-page-signatures">
      <div>
        <h3 className="text-sm font-semibold">Page signature block</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Filled once. The Word export prints this table at the bottom of every page.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {VQ_PAGE_SIGNATURE_HEADERS.map((heading) => (
                <th
                  key={heading}
                  className="border border-[var(--border)] px-2 py-1 text-left font-medium"
                >
                  {heading}
                </th>
              ))}
              <th className="w-10 border border-[var(--border)]" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {VQ_PAGE_SIGNATURE_COLUMNS.map((column, c) => (
                  <td key={column} className="border border-[var(--border)] p-1">
                    <Input
                      aria-label={`${VQ_PAGE_SIGNATURE_HEADERS[c]} row ${index + 1}`}
                      value={row[column]}
                      disabled={disabled}
                      onChange={(event) =>
                        setCell(index, column, event.target.value)
                      }
                    />
                  </td>
                ))}
                <td className="border border-[var(--border)] p-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-label={`Remove row ${index + 1}`}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...rows, emptyVqPageSignatureRow()])}
      >
        Add row
      </Button>
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
      {section === "vq_cover" ? (
        <PageSignaturesEditor
          rows={parseVqPageSignatures(content.pageSignatures)}
          disabled={readOnly}
          onChange={(next) =>
            update((prev) => ({ ...prev, pageSignatures: next }))
          }
        />
      ) : null}
      {[...(spec?.groups ?? []), ...(spec?.afterMatrix ?? [])].map((group, index) => (
        <div key={`${group.title}-${index}`} className="space-y-3">
          {group.title ? (
            <h3 className="text-sm font-semibold">{groupHeading(group)}</h3>
          ) : null}
          {group.note ? (
            <p className="whitespace-pre-line text-sm text-[var(--muted-foreground)]">
              {group.note}
            </p>
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
                  {fieldCaption(field, group)}
                </Label>
                <FieldControl
                  field={field}
                  group={group}
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

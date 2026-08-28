"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentType, SectionType } from "@/db/schema";
import {
  CHAT_SECTION_SCOPE_ALL,
  chatEditableSections,
  sectionLabel,
  type ChatSectionScope,
} from "@/lib/ai/chat/fields";
import {
  CHAT_SHEET_SCOPE_ALL,
  type ChatSheetOption,
  type ChatSheetScope,
} from "@/lib/statistical-analysis/chat-sheet-scope";

export function SectionScopeSelect({
  value,
  onChange,
  disabled,
  documentType,
}: {
  value: ChatSectionScope;
  onChange: (scope: ChatSectionScope) => void;
  disabled?: boolean;
  documentType: DocumentType;
}) {
  const sections = chatEditableSections(documentType);
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== CHAT_SECTION_SCOPE_ALL && !sections.includes(next as SectionType)) {
          return;
        }
        onChange(next as ChatSectionScope);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className="h-7 w-[7.5rem] border-[var(--border)] bg-[var(--secondary)]/30 px-2 text-[11px] font-medium"
        aria-label="Section focus"
        title="Choose which report section to focus on"
        data-testid="chat-section-scope"
      >
        <SelectValue placeholder="Section" />
      </SelectTrigger>
      <SelectContent side="top" sideOffset={6} className="text-[11px]">
        <SelectItem className="text-[11px]" value={CHAT_SECTION_SCOPE_ALL}>
          All sections
        </SelectItem>
        {sections.map((section) => (
          <SelectItem className="text-[11px]" key={section} value={section}>
            {sectionLabel(section)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SheetScopeSelect({
  value,
  onChange,
  disabled,
  sheets,
  onOpen,
}: {
  value: ChatSheetScope;
  onChange: (scope: ChatSheetScope) => void;
  disabled?: boolean;
  sheets: readonly ChatSheetOption[];
  onOpen?: () => void;
}) {
  const ids = new Set(sheets.map((sheet) => sheet.id));
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== CHAT_SHEET_SCOPE_ALL && !ids.has(next)) return;
        onChange(next);
      }}
      disabled={disabled}
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
    >
      <SelectTrigger
        className="h-7 w-[7.5rem] border-[var(--border)] bg-[var(--secondary)]/30 px-2 text-[11px] font-medium"
        aria-label="Data sheet focus"
        title="Choose which data sheet to focus on"
        data-testid="chat-sheet-scope"
      >
        <SelectValue placeholder="Sheet" />
      </SelectTrigger>
      <SelectContent side="top" sideOffset={6} className="text-[11px]">
        <SelectItem className="text-[11px]" value={CHAT_SHEET_SCOPE_ALL}>
          All data sheets
        </SelectItem>
        {sheets.map((sheet) => (
          <SelectItem className="text-[11px]" key={sheet.id} value={sheet.id}>
            {sheet.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

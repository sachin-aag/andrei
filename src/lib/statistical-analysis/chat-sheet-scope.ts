import { dataSheets } from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

export const CHAT_SHEET_SCOPE_ALL = "all" as const;

export type ChatSheetScope = typeof CHAT_SHEET_SCOPE_ALL | string;

export type ChatSheetOption = {
  id: string;
  name: string;
};

export function chatSheetOptionsFromWorksheet(
  worksheet: WorksheetData
): ChatSheetOption[] {
  return dataSheets(worksheet).map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
  }));
}

export function parseChatSheetScope(
  value: unknown,
  sheets: readonly ChatSheetOption[]
): ChatSheetScope {
  if (value === CHAT_SHEET_SCOPE_ALL) return CHAT_SHEET_SCOPE_ALL;
  if (typeof value !== "string" || !value.trim()) return CHAT_SHEET_SCOPE_ALL;
  const key = value.trim();
  const match = sheets.find(
    (sheet) =>
      sheet.id === key || sheet.name.toLowerCase() === key.toLowerCase()
  );
  return match?.id ?? CHAT_SHEET_SCOPE_ALL;
}

export function chatSheetScopeIsAll(scope: ChatSheetScope): boolean {
  return scope === CHAT_SHEET_SCOPE_ALL;
}

import { dataSheets } from "@/lib/statistical-analysis/worksheet";
import type { WorksheetData } from "@/lib/statistical-analysis/types";

/** Data sheets the Analytics composer can @ tag. */
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

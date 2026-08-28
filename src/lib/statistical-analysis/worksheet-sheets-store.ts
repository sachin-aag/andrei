import type { ChatSheetOption } from "@/lib/statistical-analysis/chat-sheet-scope";

type SheetEntry = {
  sheets: ChatSheetOption[];
  live: boolean;
};

const sheetsByReport = new Map<string, SheetEntry>();
const listeners = new Set<() => void>();

function notifyWorksheetSheetListeners() {
  for (const listener of listeners) listener();
}

export function subscribeWorksheetSheets(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function readWorksheetSheets(reportId: string): ChatSheetOption[] {
  return sheetsByReport.get(reportId)?.sheets ?? [];
}

export function worksheetSheetsAreLive(reportId: string): boolean {
  return sheetsByReport.get(reportId)?.live === true;
}

/**
 * The open worksheet publishes here so the composer dropdown can list tabs
 * the instant they are added, including unsaved local sheets.
 */
export function publishWorksheetSheets(
  reportId: string,
  sheets: readonly ChatSheetOption[],
  opts?: { live?: boolean }
): void {
  sheetsByReport.set(reportId, {
    sheets: sheets.map((sheet) => ({ id: sheet.id, name: sheet.name })),
    live: opts?.live === true,
  });
  notifyWorksheetSheetListeners();
}

export function unpublishLiveWorksheetSheets(reportId: string): void {
  const current = sheetsByReport.get(reportId);
  if (!current?.live) return;
  sheetsByReport.set(reportId, { sheets: current.sheets, live: false });
  notifyWorksheetSheetListeners();
}

/** Test helper — module cache otherwise leaks across cases. */
export function resetWorksheetSheetsStore(): void {
  sheetsByReport.clear();
  notifyWorksheetSheetListeners();
}

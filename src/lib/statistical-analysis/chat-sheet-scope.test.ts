import { describe, expect, it } from "vitest";
import { createEmptyWorksheet, addDataSheet } from "@/lib/statistical-analysis/worksheet";
import {
  CHAT_SHEET_SCOPE_ALL,
  chatSheetOptionsFromWorksheet,
  parseChatSheetScope,
} from "./chat-sheet-scope";

describe("parseChatSheetScope", () => {
  const sheets = chatSheetOptionsFromWorksheet(
    addDataSheet(createEmptyWorksheet(), "Assay")
  );

  it("keeps all and matches a live sheet id or name", () => {
    expect(parseChatSheetScope("all", sheets)).toBe(CHAT_SHEET_SCOPE_ALL);
    expect(parseChatSheetScope(sheets[1]?.id, sheets)).toBe(sheets[1]?.id);
    expect(parseChatSheetScope("Assay", sheets)).toBe(sheets[1]?.id);
  });

  it("falls back to all when the sheet is missing", () => {
    expect(parseChatSheetScope("data-99", sheets)).toBe(CHAT_SHEET_SCOPE_ALL);
    expect(parseChatSheetScope("", sheets)).toBe(CHAT_SHEET_SCOPE_ALL);
    expect(parseChatSheetScope(undefined, sheets)).toBe(CHAT_SHEET_SCOPE_ALL);
  });
});

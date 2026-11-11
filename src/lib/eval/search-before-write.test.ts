import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseChatDraftCases } from "@/lib/eval/chat-draft-cases";
import {
  ablateSearchBeforeWrite,
  formatSearchBeforeWriteReport,
} from "@/lib/eval/search-before-write";

const casesPath = path.join(
  process.cwd(),
  "scripts/eval/chat-draft-cases.json"
);

describe("ablateSearchBeforeWrite", () => {
  const cases = parseChatDraftCases(
    JSON.parse(readFileSync(casesPath, "utf8"))
  );
  const report = ablateSearchBeforeWrite(cases);

  it("scores the 6 floor cases that are not ground_draft persist rows", () => {
    expect(report.n).toBe(6);
    expect(report.correctOn).toBe(6);
    expect(report.correctOff).toBe(1);
    expect(report.rows.map((row) => row.id)).toEqual([
      "harness-greeting-no-tools",
      "harness-empty-inventory-starts-review",
      "qsr-mixed-identity-not-cover-walk",
      "qsr-draft-2-3-4-not-cover-walk",
      "qsr-table-3-only-still-cover-walk",
      "qsr-sop-title-list-keeps-search-open",
    ]);
  });

  it("writes on hello and into an empty table only when Andrei is off", () => {
    const greeting = report.rows.find(
      (row) => row.id === "harness-greeting-no-tools"
    );
    expect(greeting?.onPassed).toBe(true);
    expect(greeting?.offPassed).toBe(false);
    expect(greeting?.onLabel).toBe("stayed quiet");
    expect(greeting?.offLabel).toBe("wrote on hello");

    const empty = report.rows.find(
      (row) => row.id === "harness-empty-inventory-starts-review"
    );
    expect(empty?.onPassed).toBe(true);
    expect(empty?.offPassed).toBe(false);
    expect(empty?.offLabel).toBe("wrote into empty table");
  });

  it("collapses mixed QSR walks onto cover pages only when Andrei is off", () => {
    const mixed = report.rows.find(
      (row) => row.id === "qsr-mixed-identity-not-cover-walk"
    );
    const draft = report.rows.find(
      (row) => row.id === "qsr-draft-2-3-4-not-cover-walk"
    );
    const table3 = report.rows.find(
      (row) => row.id === "qsr-table-3-only-still-cover-walk"
    );
    expect(mixed?.onPassed).toBe(true);
    expect(mixed?.offPassed).toBe(false);
    expect(draft?.offPassed).toBe(false);
    expect(table3?.onPassed).toBe(true);
    expect(table3?.offPassed).toBe(true);
    expect(table3?.onLabel).toBe("cover walk as asked");
    expect(table3?.offLabel).toBe("cover walk as asked");
  });

  it("closes search after a title-only SOP list only when Andrei is off", () => {
    const sop = report.rows.find(
      (row) => row.id === "qsr-sop-title-list-keeps-search-open"
    );
    expect(sop?.onPassed).toBe(true);
    expect(sop?.offPassed).toBe(false);
    expect(sop?.offLabel).toBe("closed search");
  });

  it("formats a table that is not the persist slide", () => {
    const printed = formatSearchBeforeWriteReport(report);
    expect(printed).toContain("looked before writing");
    expect(printed).toContain("Andrei on 6/6   Andrei off 1/6");
    expect(printed).toContain("Not on the persist slide");
    expect(printed).not.toContain("persist-gate");
  });
});

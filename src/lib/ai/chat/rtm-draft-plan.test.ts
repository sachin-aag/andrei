import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { QSR_RTM_HEADERS, emptyQsrContent } from "@/lib/document-types/qsr/sections";
import type { JSONContent } from "@tiptap/core";
import { planRtmDraft, leftoverMissingUrsIds, rtmDraftNothingToDo } from "./rtm-draft-plan";

const URS_FILENAME = "User Requirement Specification.PDF";
const PROCESS_QUOTE =
  "Process Requirements URS-2 Reactor Capacity 8000 L URS-3 MOC Glass lining";
const CONTROL_QUOTE =
  "Instrument Requirement URS-34 Pressure transmitter CONTROL PHILOSOPHY URS-35 Vacuum gauge";
const IQ_QUOTE = "Installation Qualification URS-2 URS-99 Capacity check 13.3";

function ledgerFrom(
  pages: Array<{ filename: string; pageNumber: number; quote: string }>
): CitationPageLedger {
  const ledger = new CitationPageLedger();
  pages.forEach((page, i) => {
    ledger.record(page.filename, page.pageNumber, `att-${i}`, {
      quote: page.quote,
    });
  });
  return ledger;
}

function tableDoc(rows: string[][]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: QSR_RTM_HEADERS.map((header) => ({
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: header }] }],
            })),
          },
          ...rows.map((row) => ({
            type: "tableRow",
            content: QSR_RTM_HEADERS.map((_, col) => ({
              type: "tableCell",
              content: [
                {
                  type: "paragraph",
                  content: row[col]
                    ? [{ type: "text", text: row[col]! }]
                    : [],
                },
              ],
            })),
          })),
        ],
      },
    ],
  };
}

describe("planRtmDraft", () => {
  it("checklists reviewed URS IDs minus live rows", () => {
    const ledger = ledgerFrom([
      { filename: URS_FILENAME, pageNumber: 4, quote: PROCESS_QUOTE },
    ]);
    const plan = planRtmDraft({
      section: "qsr_rtm_process",
      ledger,
      fieldDoc: tableDoc([["URS-2", "Reactor Capacity", "8000 L"]]),
    });
    expect(plan?.expectedUrsIds).toEqual(["URS-2", "URS-3"]);
    expect(plan?.missingUrsIds).toEqual(["URS-3"]);
    expect(plan?.identitySparseIds).toEqual([]);
  });

  it("keeps 5.2 IDs out of 5.1", () => {
    const ledger = ledgerFrom([
      { filename: URS_FILENAME, pageNumber: 9, quote: CONTROL_QUOTE },
    ]);
    expect(
      planRtmDraft({
        section: "qsr_rtm_process",
        ledger,
        fieldDoc: null,
      })?.expectedUrsIds
    ).toEqual([]);
    expect(
      planRtmDraft({
        section: "qsr_rtm_control",
        ledger,
        fieldDoc: null,
      })?.expectedUrsIds
    ).toEqual(["URS-34", "URS-35"]);
  });

  it("does not source IDs from protocol pages", () => {
    const ledger = ledgerFrom([
      { filename: "Installation Qualification.PDF", pageNumber: 13, quote: IQ_QUOTE },
    ]);
    const plan = planRtmDraft({
      section: "qsr_rtm_process",
      ledger,
      fieldDoc: null,
    });
    expect(plan?.expectedUrsIds).toEqual([]);
    expect(plan?.missingUrsIds).toEqual([]);
    expect(plan?.ursPages).toEqual([]);
  });

  it("marks a seeded URS-1-only row as identity-sparse", () => {
    const ledger = ledgerFrom([
      { filename: URS_FILENAME, pageNumber: 4, quote: PROCESS_QUOTE },
      {
        filename: URS_FILENAME,
        pageNumber: 3,
        quote: "Process Requirements URS-1 Capacity 8000 L",
      },
    ]);
    const seeded = emptyQsrContent("qsr_rtm_process") as { table: JSONContent };
    const plan = planRtmDraft({
      section: "qsr_rtm_process",
      ledger,
      fieldDoc: seeded.table,
    });
    expect(plan?.identitySparseIds).toEqual(["URS-1"]);
    expect(plan?.missingUrsIds).toEqual(["URS-2", "URS-3"]);
    expect(rtmDraftNothingToDo(plan!)).toBe(false);
  });

  it("returns null for a non-RTM section", () => {
    expect(
      planRtmDraft({
        section: "qsr_references",
        ledger: ledgerFrom([]),
        fieldDoc: null,
      })
    ).toBeNull();
  });
});

describe("leftoverMissingUrsIds", () => {
  it("does not re-list IDs the insert landed after a follow-up edit_cells", () => {
    const insert = {
      kind: "insert_rows" as const,
      tableIndex: 0,
      rows: [
        ["URS-2", "MOC", "Glass lining"],
        ["URS-3", "Capacity", "8000 L"],
      ],
    };
    const edit = {
      kind: "edit_cells" as const,
      tableIndex: 0,
      cells: [
        { row: 1, col: 1, rowKey: "URS-1", insertText: "Reactor Capacity" },
      ],
    };
    expect(
      leftoverMissingUrsIds({
        operations: [insert, edit],
        ledger: ledgerFrom([
          { filename: URS_FILENAME, pageNumber: 4, quote: PROCESS_QUOTE },
        ]),
        section: "qsr_rtm_process",
        fieldDoc: null,
      })
    ).toEqual([]);
  });

  it("keeps IDs that neither operation included", () => {
    expect(
      leftoverMissingUrsIds({
        operations: [
          {
            kind: "insert_rows",
            tableIndex: 0,
            rows: [["URS-2", "Reactor Capacity", "8000 L"]],
          },
        ],
        ledger: ledgerFrom([
          { filename: URS_FILENAME, pageNumber: 4, quote: PROCESS_QUOTE },
        ]),
        section: "qsr_rtm_process",
        fieldDoc: null,
      })
    ).toEqual(["URS-3"]);
  });
});

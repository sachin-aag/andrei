import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  ledgerHasReferenceSearchEvidence,
  qsrReferenceCategoryForRowLabel,
  qsrReferencesOutstandingSearchCategories,
  qsrReferencesRowsMissingSearchEvidence,
  qsrReferencesSearchIncompleteMessage,
} from "@/lib/ai/chat/qsr-reference-search";

function ledgerFromQuote(
  rows: Array<{ filename: string; pageNumber: number; quote: string }>
): CitationPageLedger {
  const ledger = new CitationPageLedger();
  for (const row of rows) {
    ledger.record(row.filename, row.pageNumber, "att-1", { quote: row.quote });
  }
  return ledger;
}

describe("qsrReferenceCategoryForRowLabel", () => {
  it("maps Purchase Order seed label", () => {
    expect(
      qsrReferenceCategoryForRowLabel("Purchase Order (P.O)")?.searchQueries
    ).toContain("Purchase Order");
  });
});

describe("qsrReferencesRowsMissingSearchEvidence", () => {
  it("flags PO fill when no purchase-order grep landed", () => {
    const ledger = ledgerFromQuote([
      {
        filename: "Installation Qualification.PDF",
        pageNumber: 1,
        quote: "Report No. IQR/GLR-1301",
      },
    ]);
    const missing = qsrReferencesRowsMissingSearchEvidence({
      section: "qsr_references",
      ledger,
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 5,
            col: 1,
            rowKey: "Purchase Order (P.O)",
            insertText: "PO/GLR-1301 [IQ.pdf, p. 1]",
          },
        ],
      },
    });
    expect(missing).toContain("Purchase Order (P.O)");
  });

  it("allows PO when a retrieved page mentions purchase order", () => {
    const ledger = ledgerFromQuote([
      {
        filename: "PO-GLR-1301.pdf",
        pageNumber: 1,
        quote: "Purchase Order No. PO/GLR-1301",
      },
    ]);
    expect(
      qsrReferencesRowsMissingSearchEvidence({
        section: "qsr_references",
        ledger,
        operation: {
          kind: "edit_cells",
          tableIndex: 0,
          cells: [
            {
              row: 5,
              col: 1,
              rowKey: "Purchase Order (P.O)",
              insertText: "PO/GLR-1301 [PO-GLR-1301.pdf, p. 1]",
            },
          ],
        },
      })
    ).toEqual([]);
  });
});

describe("qsrReferencesOutstandingSearchCategories", () => {
  it("lists categories with no retrieval touch", () => {
    const ledger = ledgerFromQuote([
      {
        filename: "URS.pdf",
        pageNumber: 1,
        quote: "URS/GLR-1301 Rev 00",
      },
    ]);
    const open = qsrReferencesOutstandingSearchCategories(ledger);
    expect(open).toContain("Purchase Order (P.O)");
    expect(open).not.toContain("User Requirement Specification");
  });
});

describe("ledgerHasReferenceSearchEvidence", () => {
  it("matches filename needles", () => {
    const ledger = ledgerFromQuote([
      { filename: "3XPER-VMP-001.pdf", pageNumber: 1, quote: "Rev 01" },
    ]);
    expect(
      ledgerHasReferenceSearchEvidence(ledger, ["3XPER-VMP-001"])
    ).toBe(true);
  });
});

describe("qsrReferencesSearchIncompleteMessage", () => {
  it("names missing row classes", () => {
    expect(
      qsrReferencesSearchIncompleteMessage(["Purchase Order (P.O)"])
    ).toMatch(/Purchase Order/);
  });
});

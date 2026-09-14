import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  groundDraftText,
  groundTableOperation,
} from "@/lib/ai/chat/ground-draft";
import { GROUNDEDNESS_GOLD_CASES } from "@/lib/eval/groundedness-cases";

function ledgerFromPages(
  pages: Array<{
    filename: string;
    pageNumber: number;
    attachmentId: string;
    quote: string;
  }>
): CitationPageLedger {
  const ledger = new CitationPageLedger();
  for (const page of pages) {
    ledger.record(page.filename, page.pageNumber, page.attachmentId, {
      quote: page.quote,
    });
  }
  return ledger;
}

describe("groundDraftText", () => {
  it("fails open when the ledger is empty", () => {
    const ledger = new CitationPageLedger();
    const result = groundDraftText({
      text: "Invented batch MF-25-VIAL-01 on E/PR/070.",
      ledger,
      policy: "block",
    });
    expect(result.blocked).toBe(false);
    expect(result.provenance.claims).toEqual([]);
    expect(result.text).toContain("MF-25-VIAL-01");
  });

  it("fails open when recorded pages have no served quotes yet", () => {
    const ledger = new CitationPageLedger();
    ledger.record("PQR-24-PR-102.pdf", 2, "att-pqr");
    const result = groundDraftText({
      text: "Invented batch MF-25-VIAL-01 on E/PR/070.",
      ledger,
      policy: "block",
    });
    expect(result.blocked).toBe(false);
    expect(result.provenance.claims).toEqual([]);
    expect(result.text).toContain("MF-25-VIAL-01");
  });

  it.each(GROUNDEDNESS_GOLD_CASES)(
    "replays $id",
    (gold) => {
      const result = groundDraftText({
        text: gold.draft,
        ledger: ledgerFromPages(gold.pages),
        policy: gold.policy,
      });
      expect(result.blocked).toBe(gold.expectBlocked);
      expect(
        result.unsupported.map((fact) => fact.text)
      ).toEqual(expect.arrayContaining(gold.expectUnsourced));
      expect(
        result.provenance.claims
          .filter((claim) => claim.status === "verified")
          .map((claim) => claim.text)
      ).toEqual(expect.arrayContaining(gold.expectVerified));
      if (gold.expectCitationMoved) {
        expect(
          result.provenance.claims
            .filter((claim) => claim.status === "citation_moved")
            .map((claim) => claim.text)
        ).toEqual(expect.arrayContaining(gold.expectCitationMoved));
        expect(result.text).toContain("p. 8");
        expect(result.text).not.toMatch(/p\. 2\]/);
      }
      if (gold.expectBlocked) {
        expect(result.text).toContain("<identifier>");
        expect(result.text).not.toContain("MF-25-VIAL-01");
      } else if (gold.expectUnsourced.includes("MF-25-VIAL-01")) {
        expect(result.text).toContain("MF-25-VIAL-01");
      }
    }
  );
});

describe("groundTableOperation", () => {
  it("blocks an invented media-fill serial in a table cell on MJ", () => {
    const gold = GROUNDEDNESS_GOLD_CASES[0]!;
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 1,
            insertText: "MF-25-VIAL-01 [PQR-24-PR-102.pdf, p. 2]",
          },
        ],
      },
      ledger: ledgerFromPages(gold.pages),
      policy: "block",
    });
    expect(result.blocked).toBe(true);
    expect(result.operation).toMatchObject({
      kind: "edit_cells",
      cells: [{ insertText: "<identifier> [PQR-24-PR-102.pdf, p. 2]" }],
    });
  });
});

import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  groundDraftText,
  groundTableOperation,
} from "@/lib/ai/chat/ground-draft";
import { GROUNDEDNESS_GOLD_CASES } from "@/lib/eval/groundedness-cases";
import { moveCitationsToEndOfText } from "@/lib/suggestions/citations-at-end";

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

describe("groundDraftText citation parking", () => {
  const PROTOCOL = "PRQP-25-PR-001 Protocol.pdf";
  const REPORT = "PRQR-25-PR-005 Report.pdf";
  const SOP = "SOP/DP/QA/014";

  const pages = [
    {
      filename: PROTOCOL,
      pageNumber: 21,
      attachmentId: "att-protocol",
      quote: "Periodic Re-Qualification protocol for isolator filling. Scope of testing only.",
    },
    {
      filename: REPORT,
      pageNumber: 2,
      attachmentId: "att-report",
      quote: `This review is performed in accordance with Validation/Qualification Procedure ${SOP}.`,
    },
  ];

  it("moves a mis-cited SOP then parks a single numbered marker (Langfuse Objective mix)", () => {
    const draft = `The purpose of this Equipment Lifecycle Report (ELR) is to provide a periodic, consolidated review of the equipment since its last Periodic Re-Qualification, in accordance with Validation/Qualification Procedure ${SOP} [${PROTOCOL}, p. 21].`;
    const grounded = groundDraftText({
      text: draft,
      ledger: ledgerFromPages(pages),
      policy: "block",
    });
    expect(grounded.blocked).toBe(false);
    expect(
      grounded.provenance.claims
        .filter((claim) => claim.status === "citation_moved")
        .map((claim) => claim.text)
    ).toEqual([SOP]);
    expect(grounded.text).toContain(`[${REPORT}, p. 2]`);
    expect(grounded.text).not.toContain(`[${PROTOCOL}, p. 21]`);

    const parked = moveCitationsToEndOfText(grounded.text);
    expect(parked).toMatch(new RegExp(`${SOP.replaceAll("/", "\\/")} \\[1\\]`));
    expect(parked).not.toMatch(/\[PRQR-25-PR-005 Report\.pdf, p\. 2\] \[1\]/);
    expect(parked).not.toContain(`[${PROTOCOL}, p. 21]`);
    expect(parked).toContain(`1. [${REPORT}, p. 2]`);
    expect((parked.match(/\[\d+\]/g) ?? []).length).toBe(1);
  });

  it("rewrites a parked Citations line instead of inserting a filename cite beside [n]", () => {
    const parkedDraft = `The review follows ${SOP} [1].\n\nCitations:\n1. [${PROTOCOL}, p. 21]`;
    const grounded = groundDraftText({
      text: parkedDraft,
      ledger: ledgerFromPages(pages),
      policy: "block",
    });
    expect(grounded.blocked).toBe(false);
    expect(grounded.text).toMatch(new RegExp(`${SOP.replaceAll("/", "\\/")} \\[1\\]`));
    expect(grounded.text).toContain(`1. [${REPORT}, p. 2]`);
    expect(grounded.text).not.toContain(`[${REPORT}, p. 2] [1]`);
    expect(grounded.text).not.toContain(`[${PROTOCOL}, p. 21]`);
  });
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

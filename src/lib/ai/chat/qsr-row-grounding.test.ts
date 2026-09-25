import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import {
  descriptionSupportedNearKey,
  documentFamilyFromContext,
  extraQsrUnsupported,
  qsrFailClosedReason,
  quoteWindowAroundKey,
  rowKeyFromContext,
} from "@/lib/ai/chat/qsr-row-grounding";

const SHARED_URS_PAGE =
  "URS-5 Jacket temperature 20-25 °C for the jacket loop. URS-37 Process temperature 15–130 °C for the vessel. URS-44 Emergency Stop push button at each station.";

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

describe("quoteWindowAroundKey", () => {
  it("stops at the next URS ID so a same-page neighbour does not leak", () => {
    const urs5 = quoteWindowAroundKey(SHARED_URS_PAGE, "URS-5");
    const urs37 = quoteWindowAroundKey(SHARED_URS_PAGE, "URS-37");
    expect(urs5).toContain("20-25");
    expect(urs5).not.toContain("15–130");
    expect(urs37).toContain("15–130");
    expect(urs37).not.toContain("Emergency Stop");
  });
});

describe("descriptionSupportedNearKey", () => {
  it("rejects Emergency Stop on URS-5 when that phrasing belongs to URS-44", () => {
    expect(
      descriptionSupportedNearKey("Emergency Stop push button", [SHARED_URS_PAGE], "URS-5")
    ).toBe(false);
    expect(
      descriptionSupportedNearKey("Emergency Stop push button", [SHARED_URS_PAGE], "URS-44")
    ).toBe(true);
  });
});

describe("qsrRtmCellUnsupported / extraQsrUnsupported", () => {
  it("blocks stock Complies unless the named stage protocol passes that URS ID", () => {
    const emptyPass = ledgerFromPages([
      {
        filename: "IQ-GLR-1301.pdf",
        pageNumber: 12,
        attachmentId: "iq",
        quote: "URS-5 N/A for this protocol section.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "Complies",
        context: "URS-5\nIQ",
        section: "qsr_rtm_safety",
        ledger: emptyPass,
      }).map((fact) => fact.text)
    ).toContain("Complies");

    const passed = ledgerFromPages([
      {
        filename: "IQ-GLR-1301.pdf",
        pageNumber: 12,
        attachmentId: "iq",
        quote: "URS-5 Installation check meets acceptance. Result: complies.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "Complies",
        context: "URS-5\nIQ",
        section: "qsr_rtm_safety",
        ledger: passed,
      })
    ).toEqual([]);
  });

  it("blocks a stage cell when that protocol never names the row URS ID", () => {
    const ledger = ledgerFromPages([
      {
        filename: "OQ-GLR-1301.pdf",
        pageNumber: 4,
        attachmentId: "oq",
        quote: "Operational checks for agitator speed only.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "OQ",
        context: "URS-5",
        section: "qsr_rtm_process",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("OQ");
  });

  it("blocks VFD-compatible agitator text when the ledger already has an RPM", () => {
    const ledger = ledgerFromPages([
      {
        filename: "URS-GLR-1301.pdf",
        pageNumber: 3,
        attachmentId: "urs",
        quote: "Agitator speed 50 ± 10 RPM.",
      },
    ]);
    expect(
      extraQsrUnsupported({
        cell: "VFD compatible",
        context: "Agitator RPM",
        section: "qsr_operating_range",
        ledger,
      }).map((fact) => fact.text)
    ).toContain("VFD compatible");
  });
});

describe("qsrFailClosedReason", () => {
  it("fails closed on an RTM write when the URS is attached but unread", () => {
    const ledger = new CitationPageLedger();
    expect(
      qsrFailClosedReason({
        section: "qsr_rtm_safety",
        attachedFilenames: ["URS-GLR-1301.pdf"],
        ledger,
      })
    ).toMatch(/URS is attached/);
  });

  it("does not fail closed on an investigation table", () => {
    expect(
      qsrFailClosedReason({
        section: "define",
        attachedFilenames: ["URS-GLR-1301.pdf"],
        ledger: new CitationPageLedger(),
      })
    ).toBeNull();
  });
});

describe("row helpers", () => {
  it("reads the first URS-N as the row key", () => {
    expect(rowKeyFromContext("URS-44 Emergency Stop")).toBe("URS-44");
  });

  it("maps Qual Docs row labels to a document family", () => {
    expect(documentFamilyFromContext("URS User Requirement Specification")).toBe(
      "urs"
    );
    expect(documentFamilyFromContext("Design Qualification protocol")).toBe("dq");
  });

  it("still extracts a temperature that lives only in a neighbour window", () => {
    const facts = extractHardFacts(SHARED_URS_PAGE);
    expect(facts.map((fact) => `${fact.kind}:${fact.text}`)).toEqual(
      expect.arrayContaining([
        "temperature:20-25 °C",
        "temperature:15–130 °C",
        "identifier:URS-5",
        "identifier:URS-37",
        "identifier:URS-44",
      ])
    );
  });
});

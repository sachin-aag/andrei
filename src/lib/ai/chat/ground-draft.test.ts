import { describe, expect, it } from "vitest";
import { CitationPageLedger } from "@/lib/ai/chat/citation-grounding";
import {
  containsGatedFactPlaceholders,
  groundDraftText,
  groundTableOperation,
  NUMBER_MOVE_SMALL_LEDGER,
  tablePlaceholderLabels,
  tableLookupPlaceholderLabels,
  tablePlaceholderLookupMessage,
  TABLE_PLACEHOLDER_LOOKUP_MESSAGE,
  unsupportedFactsToolResult,
  UNSUPPORTED_FACTS_RETRY_MESSAGE,
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

describe("groundDraftText QSR row windows", () => {
  const ursPage = {
    filename: "URS-GLR-1301.pdf",
    pageNumber: 4,
    attachmentId: "urs",
    quote:
      "URS-5 Jacket temperature 20-25 °C for the jacket loop. URS-37 Process temperature 15–130 °C for the vessel. URS-44 Emergency Stop push button at each station.",
  };

  it("does not copy URS-37's temperature onto the URS-5 row", () => {
    const result = groundDraftText({
      text: "15–130 °C",
      ledger: ledgerFromPages([ursPage]),
      policy: "block",
      context: "URS-5 Jacket temperature",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["15–130 °C"])
    );
  });

  it("accepts the temperature that sits in that URS-ID window", () => {
    const result = groundDraftText({
      text: "20-25 °C",
      ledger: ledgerFromPages([ursPage]),
      policy: "block",
      context: "URS-5 Jacket temperature",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("20-25 °C");
  });

  it("blocks unsigned 15 °C on operating-range Minimum when the URS shows −15 °C", () => {
    const result = groundDraftText({
      text: "15 °C",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 6,
          attachmentId: "urs",
          quote: "URS-3 Shell Operating temperature −15 °C to 130 °C",
        },
      ]),
      policy: "block",
      context: "Temperature\nMinimum",
      grounding: { section: "qsr_operating_range" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["15 °C"])
    );
  });

  it("accepts −15 °C on operating-range Minimum from the URS", () => {
    const result = groundDraftText({
      text: "−15 °C",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 6,
          attachmentId: "urs",
          quote: "URS-3 Shell Operating temperature −15 °C to 130 °C",
        },
      ]),
      policy: "block",
      context: "Temperature\nMinimum",
      grounding: { section: "qsr_operating_range" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("−15 °C");
  });

  it("blocks unsigned 20 °C on URS-37 when the URS shows −20 °C to 150 °C", () => {
    const result = groundDraftText({
      text: "20 °C",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 8,
          attachmentId: "urs",
          quote:
            "URS-37 Temperature To measure the temperature - 20 °C to 150 °C",
        },
      ]),
      policy: "block",
      context: "URS-37\nTemperature",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["20 °C"])
    );
  });

  it("accepts −20 °C to 150 °C on URS-37 from the URS", () => {
    const result = groundDraftText({
      text: "-20 °C to 150 °C",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 8,
          attachmentId: "urs",
          quote:
            "URS-37 Temperature To measure the temperature - 20 °C to 150 °C",
        },
      ]),
      policy: "block",
      context: "URS-37\nTemperature",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toMatch(/-20/);
    expect(result.text).toContain("150");
  });

  it("blocks unsigned 50±10 RPM on URS-10 when the URS shows −50 ± 10 RPM", () => {
    const result = groundDraftText({
      text: "50+-10 RPM",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 7,
          attachmentId: "urs",
          quote: "URS-10 RPM requirement –50 ± 10 RPM",
        },
      ]),
      policy: "block",
      context: "URS-10\nRPM requirement",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text).join(" ")).toMatch(
      /50/
    );
  });

  it("accepts −50 ± 10 RPM on URS-10 from the URS", () => {
    const result = groundDraftText({
      text: "–50 ± 10 RPM",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 7,
          attachmentId: "urs",
          quote: "URS-10 RPM requirement –50 ± 10 RPM",
        },
      ]),
      policy: "block",
      context: "URS-10\nRPM requirement",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("50");
    expect(result.text).toMatch(/[-−–]50/);
  });

  it("accepts ~50±10 RPM on URS-10 when the URS shows a tilde", () => {
    const result = groundDraftText({
      text: "~50±10 RPM",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 6,
          attachmentId: "urs",
          quote: "URS-10 RPM requirement ~50±10 RPM",
        },
      ]),
      policy: "block",
      context: "URS-10\nRPM requirement",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("~50");
    expect(result.text).not.toMatch(/[-−–]50/);
  });

  it("blocks invented −50 RPM on URS-10 when the URS shows ~50±10 RPM", () => {
    const result = groundDraftText({
      text: "–50 ± 10 RPM",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 6,
          attachmentId: "urs",
          quote: "URS-10 RPM requirement ~50±10 RPM",
        },
      ]),
      policy: "block",
      context: "URS-10\nRPM requirement",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text).join(" ")).toMatch(
      /50/
    );
  });

  it("accepts 8000 L from the URS cover on the URS-1 row", () => {
    const result = groundDraftText({
      text: "8000 L [User Requirement Specification.PDF, p. 1]",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 1,
          attachmentId: "urs",
          quote:
            "Equipment Name Glass Lined Reactor Capacity 8000 L Equipment ID GLR-1301 Page 1 of 12",
        },
      ]),
      policy: "block",
      context: "URS-1\nReactor Capacity",
      grounding: { section: "qsr_rtm_process" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("8000 L");
    expect(result.unsupported).toEqual([]);
  });

  it("writes CVP 10000 L as 10k L after the cited page verifies it", () => {
    const result = groundDraftText({
      text: "10000 L [CPDR.pdf, p. 2]",
      ledger: ledgerFromPages([
        {
          filename: "CPDR.pdf",
          pageNumber: 2,
          attachmentId: "cpdr",
          quote: "GLR-1302 Capacity 10000 L MSGL",
        },
      ]),
      policy: "block",
      grounding: { section: "cvp_equipment_sampling" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("10k L");
    expect(result.text).not.toContain("10000 L");
  });

  it("accepts 0 to 760 mmHg for URS-35 when the URS page states it outside a neighbour window", () => {
    const result = groundDraftText({
      text: "0 to 760 mmHg",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 8,
          attachmentId: "urs",
          quote:
            "Vacuum gauge to measure the vacuum produced. Range 0 to 760 mmHg. URS-36 Pressure Gauge.",
        },
      ]),
      policy: "block",
      context: "URS-35\nVacuum gauge",
      grounding: { section: "qsr_rtm_control" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("760 mmHg");
  });

  it("does not treat SS 316L as an unsourced litre quantity on a URS-39 row", () => {
    const result = groundDraftText({
      text: "Glass lined / SS 316L",
      ledger: ledgerFromPages([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 9,
          attachmentId: "urs",
          quote:
            "URS-39 Contact parts of the equipment shall be Glass lined / SS 316L.",
        },
      ]),
      policy: "block",
      context: "URS-39\nContact parts",
      grounding: { section: "qsr_rtm_gmp" },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("SS 316L");
  });

  it("rejects Emergency Stop text on URS-5 when that phrasing is URS-44", () => {
    const result = groundDraftText({
      text: "Emergency Stop push button",
      ledger: ledgerFromPages([ursPage]),
      policy: "block",
      context: "URS-5",
      grounding: { section: "qsr_rtm_safety" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.some((fact) => /emergency stop/i.test(fact.text))).toBe(
      true
    );
  });

  it("fails closed when the URS is attached but no page was retrieved", () => {
    const result = groundDraftText({
      text: "URS-5 Jacket temperature 20-25 °C",
      ledger: new CitationPageLedger(),
      policy: "block",
      grounding: {
        section: "qsr_rtm_safety",
        attachedFilenames: ["URS-GLR-1301.pdf"],
      },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported[0]?.text).toMatch(/URS is attached/);
  });

  it("still fails open on an investigation write with an empty ledger", () => {
    const result = groundDraftText({
      text: "Invented batch MF-25-VIAL-01",
      ledger: new CitationPageLedger(),
      policy: "block",
      grounding: {
        section: "define",
        attachedFilenames: ["URS-GLR-1301.pdf"],
      },
    });
    expect(result.blocked).toBe(false);
    expect(result.text).toContain("MF-25-VIAL-01");
  });

  it("does not keep a DQ approval date on the URS Qual Docs row", () => {
    const result = groundDraftText({
      text: "12 Jan 2024",
      ledger: ledgerFromPages([
        {
          filename: "DQ-GLR-1301.pdf",
          pageNumber: 2,
          attachmentId: "dq",
          quote: "Design Qualification approved 12 Jan 2024 Revision 01",
        },
        {
          filename: "URS-GLR-1301.pdf",
          pageNumber: 1,
          attachmentId: "urs",
          quote: "User Requirement Specification Revision 00 approved 03 Mar 2023",
        },
      ]),
      policy: "block",
      context: "URS User Requirement Specification",
      grounding: { section: "qsr_qualification_documents" },
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["12 Jan 2024"])
    );
  });
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

  it("inserts a missing citation after the word, not inside **0**", () => {
    const draft =
      "Total product scrap or batch loss across all trended themes was **0** units. All 4 technical themes remain open.";
    const grounded = groundDraftText({
      text: draft,
      ledger: ledgerFromPages([
        {
          filename: "scrap-log.pdf",
          pageNumber: 6,
          attachmentId: "att-scrap",
          quote: "Total product scrap or batch loss across all trended themes was 0 units.",
        },
      ]),
      policy: "flag",
    });
    expect(grounded.text).toContain("was **0** [scrap-log.pdf, p. 6] units.");
    expect(grounded.text).not.toMatch(/\*\*0\s*\[/);
    const parked = moveCitationsToEndOfText(grounded.text);
    expect(parked).toContain("was **0** [1] units.");
    expect(parked).toContain("1. [scrap-log.pdf, p. 6]");
  });

  it("skip mode does not gate or move citations onto a coincidental page", () => {
    const result = groundDraftText({
      text: "Period 01 April 2024 per SOP/DP/QA/014.",
      ledger: ledgerFromPages([
        {
          filename: "PQR-24-PR-042.pdf",
          pageNumber: 58,
          attachmentId: "att-pqr",
          quote:
            "Calibration due 01 April 2024. Annexure for balance EQ-12.",
        },
      ]),
      policy: "block",
      grounding: { mode: "skip" },
    });
    expect(result.blocked).toBe(false);
    expect(result.unsupported).toEqual([]);
    expect(result.provenance.claims).toEqual([]);
    expect(result.text).toBe("Period 01 April 2024 per SOP/DP/QA/014.");
    expect(result.text).not.toContain("PQR-24-PR-042.pdf");
  });

  it("frame mode exempts user-stated FY dates but still blocks an invented batch", () => {
    const ledger = ledgerFromPages([
      {
        filename: "Planner.pdf",
        pageNumber: 22,
        attachmentId: "att-plan",
        quote: "Annual calibration planner EQ-12 Balance",
      },
    ]);
    const fyGrounding = {
      mode: "frame" as const,
      latestUserMessageText: "go for april 2024 to march 2025",
      reportMetadata: { equipmentId: "E/PR/071" },
    };
    const period = groundDraftText({
      text: "Cartridge line E/PR/071. Period 01 April 2024 to 31 March 2025.",
      ledger,
      policy: "block",
      grounding: fyGrounding,
    });
    expect(period.blocked).toBe(false);
    expect(period.text).toContain("01 April 2024");
    expect(period.text).toContain("E/PR/071");
    expect(period.text).not.toContain("Planner.pdf");

    const invented = groundDraftText({
      text: "Media fill MF-25-VIAL-01 on E/PR/071.",
      ledger,
      policy: "block",
      grounding: fyGrounding,
    });
    expect(invented.blocked).toBe(true);
    expect(invented.text).toContain("<identifier>");
    expect(invented.text).not.toContain("MF-25-VIAL-01");
    expect(invented.text).toContain("E/PR/071");
  });

  it("frame mode exempts a fact already stated in a sibling table", () => {
    const ledger = ledgerFromPages([
      {
        filename: "Planner.pdf",
        pageNumber: 22,
        attachmentId: "att-plan",
        quote: "Annual calibration planner EQ-12 Balance",
      },
    ]);
    const recap = groundDraftText({
      text: "[[table]] records breakdown PR/BD/001.",
      ledger,
      policy: "block",
      grounding: {
        mode: "frame",
        alreadyStatedText: "PR/BD/001 closed 12 Mar 2025.",
      },
    });
    expect(recap.blocked).toBe(false);
    expect(recap.text).toContain("PR/BD/001");
    expect(recap.text).not.toContain("Planner.pdf");

    const copied = groundDraftText({
      text: "Follow SOP/DP/QA/014 for the review.",
      ledger,
      policy: "block",
      grounding: {
        mode: "frame",
        alreadyStatedText: "PR/BD/001 closed 12 Mar 2025.",
      },
    });
    expect(copied.blocked).toBe(true);
    expect(copied.text).toContain("<identifier>");
    expect(copied.text).not.toContain("SOP/DP/QA/014");
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

  it("keeps a cited date on the named page when that date also appears on SOP/PRQ pages", () => {
    const vsr = "VSR-25-PR-001.pdf";
    const sop = "SOP-DP-QA-014.pdf";
    const date = "15/07/2024";
    const grounded = groundDraftText({
      text: `Last validation ${date} [${vsr}, p. 4].`,
      ledger: ledgerFromPages([
        {
          filename: vsr,
          pageNumber: 4,
          attachmentId: "att-vsr",
          quote: "",
        },
        {
          filename: sop,
          pageNumber: 12,
          attachmentId: "att-sop",
          quote: `Revision history approved ${date}. Periodic re-qualification ${date}.`,
        },
        {
          filename: "PRQR-25-PR-005.pdf",
          pageNumber: 3,
          attachmentId: "att-prq",
          quote: `Qualification completed ${date}.`,
        },
      ]),
      policy: "block",
    });
    expect(grounded.blocked).toBe(false);
    expect(
      grounded.provenance.claims.find((claim) => claim.text === date)?.status
    ).toBe("verified");
    expect(grounded.text).toContain(`[${vsr}, p. 4]`);
    expect(grounded.text).not.toContain(`[${sop}, p. 12]`);
  });

  it("does not steal a shared parked [n] when only one claim must move", () => {
    const parkedDraft = `The review follows ${SOP} [1]. Isolation was 14 days [1].\n\nCitations:\n1. [${PROTOCOL}, p. 21]`;
    const durationPages = [
      ...pages,
      {
        filename: REPORT,
        pageNumber: 8,
        attachmentId: "att-report",
        quote: "Hold time 14 days before load.",
      },
    ];
    const grounded = groundDraftText({
      text: parkedDraft,
      ledger: ledgerFromPages(durationPages),
      policy: "block",
    });
    expect(grounded.text).toMatch(/14 days \[2\]/);
    expect(grounded.text).toMatch(new RegExp(`${SOP.replaceAll("/", "\\/")} \\[1\\]`));
    expect(grounded.text).toContain(`1. [${REPORT}, p. 2]`);
    expect(grounded.text).toContain(`2. [${REPORT}, p. 8]`);
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
      cells: [{ insertText: "<identifier>" }],
    });
  });

  it("grounds create_table headers against sibling header text", () => {
    const gold = GROUNDEDNESS_GOLD_CASES[0]!;
    const result = groundTableOperation({
      operation: {
        kind: "create_table",
        headers: ["Serial", "Result"],
        rows: [["MF-25-VIAL-01", "Pass"]],
      },
      ledger: ledgerFromPages(gold.pages),
      policy: "block",
    });
    expect(result.operation).toMatchObject({
      kind: "create_table",
      headers: ["Serial", "Result"],
    });
    expect(result.blocked).toBe(true);
    const row =
      result.operation.kind === "create_table"
        ? result.operation.rows?.[0]
        : undefined;
    expect(row?.[0]).toContain("<identifier>");
    expect(row?.[0]).not.toContain("MF-25-VIAL-01");
  });

  it("keeps a CSV date on the VSR cited in documentRef instead of a colliding SOP page", () => {
    const vsr = "VSR-25-PR-001.pdf";
    const sop = "SOP-DP-QA-014.pdf";
    const result = groundTableOperation({
      operation: {
        kind: "insert_rows",
        tableIndex: 0,
        rows: [
          [
            "1",
            "SCADA",
            "Validated",
            "15/07/2024 [CSV-cover.pdf, p. 1]",
            "14/07/2025",
            "VSR-25-PR-001",
          ],
        ],
      },
      ledger: ledgerFromPages([
        {
          filename: "CSV-cover.pdf",
          pageNumber: 1,
          attachmentId: "att-cover",
          quote: "Computerized System Validation Status.",
        },
        {
          filename: vsr,
          pageNumber: 4,
          attachmentId: "att-vsr",
          quote:
            "VSR-25-PR-001 last validation 15/07/2024 revalidation due 14/07/2025.",
        },
        {
          filename: sop,
          pageNumber: 12,
          attachmentId: "att-sop",
          quote: "SOP revision approved 15/07/2024. Next review 14/07/2025.",
        },
      ]),
      policy: "block",
    });
    expect(result.blocked).toBe(false);
    const dateCell = (result.operation as { rows: string[][] }).rows[0]![3]!;
    expect(dateCell).toContain(`[${vsr}, p. 4]`);
    expect(dateCell).not.toContain(`[${sop}, p. 12]`);
    expect(dateCell).not.toContain("[CSV-cover.pdf, p. 1]");
  });

  it("does not pin an uncited 5,000 from a hydrated review dump even when unique", () => {
    const filler = Array.from({ length: NUMBER_MOVE_SMALL_LEDGER + 1 }, (_, i) => ({
      filename: `PQR-24-PR-102-part-${i + 1}.pdf`,
      pageNumber: i + 1,
      attachmentId: `att-pqr-${i + 1}`,
      quote:
        i === NUMBER_MOVE_SMALL_LEDGER
          ? "Vial line PQ fill volume 5,000 units. Batch PV-24-009."
          : `Calibration due 0${i + 1}/01/2024 for EQ-${10 + i}.`,
    }));
    const result = groundDraftText({
      text: "Media fill filled 5,000 units.",
      ledger: ledgerFromPages(filler),
      policy: "block",
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.some((fact) => fact.text.includes("5,000"))).toBe(
      true
    );
    expect(result.text).toContain("<number>");
    expect(result.text).not.toContain("5,000");
  });

  it("does not steal an uncited 5,000 from an unrelated hydrated PQ page", () => {
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 4,
            insertText: "5,000 [PR-discrepancy.pdf, p. 29]",
          },
        ],
      },
      ledger: ledgerFromPages([
        {
          filename: "PR-discrepancy.pdf",
          pageNumber: 29,
          attachmentId: "att-disc",
          quote:
            "Leak test 28/06/2024 Cartridge 3.2 mL qty 8. Media Fill and not for product filling.",
        },
        {
          filename: "PQR-24-PR-102-part-3.pdf",
          pageNumber: 19,
          attachmentId: "att-pqr3",
          quote: "Vial line PQ fill volume 5,000 units. Batch PV-24-009.",
        },
      ]),
      policy: "block",
    });
    expect(result.blocked).toBe(true);
    expect(result.unsupported.map((fact) => fact.text)).toContain("5,000");
    const cell = (result.operation as { cells: Array<{ insertText: string }> })
      .cells[0]!;
    expect(cell.insertText).toContain("<number>");
    expect(cell.insertText).not.toContain("5,000");
    expect(cell.insertText).not.toContain("PQR-24-PR-102-part-3.pdf");
  });

  it("retargets 5,000 when the row identifier uniquely pins the APS page", () => {
    const result = groundDraftText({
      text: "MF-24-VIAL-01 filled 5,000 [Planner.pdf, p. 22].",
      ledger: ledgerFromPages([
        {
          filename: "Planner.pdf",
          pageNumber: 22,
          attachmentId: "att-plan",
          quote: "Annual calibration planner EQ-12 Balance",
        },
        {
          filename: "PQR-24-PR-102.pdf",
          pageNumber: 8,
          attachmentId: "att-pqr",
          quote:
            "Aseptic process simulation MF-24-VIAL-01: 5,000 units filled, contaminated units 0.",
        },
      ]),
      policy: "block",
    });
    expect(result.blocked).toBe(false);
    expect(
      result.provenance.claims
        .filter((claim) => claim.status === "citation_moved")
        .map((claim) => claim.text)
    ).toContain("5,000");
    expect(result.text).toContain("5,000");
    expect(result.text).toContain("[PQR-24-PR-102.pdf, p. 8]");
    expect(result.text).not.toContain("[Planner.pdf, p. 22]");
  });

  it("strips a coincidental Stage-4 protocol cite from a 5 L GMP rinse floor", () => {
    const protocol =
      "CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol.docx";
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 1,
        cells: [
          {
            row: 8,
            col: 7,
            rowKey: "MF-1301",
            rowContext: "Micron Filter MF-1301 10\" 0.14 m²",
            insertText: `5 L [${protocol}, p. 3]`,
          },
        ],
      },
      ledger: ledgerFromPages([
        {
          filename: protocol,
          pageNumber: 3,
          attachmentId: "att-cvp",
          quote:
            "Rinse Factor RF = 3L/m². Solvent Adherence Factor SAF. Table 7 WAF ranges 1–3 L/m², 3–5 L/m², 5-10 L/m².",
        },
        {
          filename: protocol,
          pageNumber: 1,
          attachmentId: "att-cvp",
          quote:
            "Plug Flow Reactor PFR-1301 (5 L HAS). Micron Filter MF-1301 size 10\".",
        },
      ]),
      policy: "block",
      grounding: {
        section: "cvp_rinse_volume",
        tableColumnLabel: "Considered volume",
      },
    });
    expect(result.blocked).toBe(false);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).toContain("5 L");
    expect(cell).not.toContain("<number>");
    expect(cell).not.toContain(protocol);
    expect(cell).not.toMatch(/\[\d+\]/);
  });

  it("keeps the cite when the page prints that considered rinse volume", () => {
    const protocol =
      "CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol.docx";
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 1,
        cells: [
          {
            row: 8,
            col: 7,
            rowKey: "MF-1301",
            insertText: `5 L [${protocol}, p. 4]`,
          },
        ],
      },
      ledger: ledgerFromPages([
        {
          filename: protocol,
          pageNumber: 4,
          attachmentId: "att-cvp",
          quote:
            "MF-1301 micron filter considered rinse volume 5 L to flood the 10 inch housing.",
        },
      ]),
      policy: "block",
      grounding: {
        section: "cvp_rinse_volume",
        tableColumnLabel: "Considered volume",
      },
    });
    expect(result.blocked).toBe(false);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).toContain("5 L");
    expect(cell).toContain(`[${protocol}, p. 4]`);
  });
});

describe("gated placeholder persist policy", () => {
  it("detects MJ fact-gating tokens", () => {
    expect(containsGatedFactPlaceholders("Due <date>")).toBe(true);
    expect(containsGatedFactPlaceholders("id <identifier>")).toBe(true);
    expect(containsGatedFactPlaceholders("n <number>")).toBe(true);
    expect(containsGatedFactPlaceholders("use <batch number>")).toBe(false);
  });

  it("treats column-label table tokens as leftovers, not only <date>/<number>", () => {
    expect(
      tablePlaceholderLabels({
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 2, insertText: "<Date of Execution>" },
          { row: 1, col: 4, insertText: "<Units Filled>" },
        ],
      })
    ).toEqual(["<Date of Execution>", "<Units Filled>"]);
    expect(
      tablePlaceholderLookupMessage(["<Units Filled>"])
    ).toContain(TABLE_PLACEHOLDER_LOOKUP_MESSAGE);
    expect(tablePlaceholderLookupMessage(["<Units Filled>"])).toContain(
      "Missing: <Units Filled>."
    );
  });

  it("treats leftover angle-bracket cells as lookup tokens on any table kind", () => {
    expect(
      tableLookupPlaceholderLabels({
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 1, insertText: "Pass" },
          { row: 1, col: 3, insertText: "<result>" },
          { row: 1, col: 4, insertText: "<section>" },
        ],
      })
    ).toEqual(["<result>", "<section>"]);
  });

  it("tells the model to fill real values, not invent them", () => {
    const result = unsupportedFactsToolResult({
      unsupported: [],
      draftWithPlaceholders: "Due <date>",
    });
    expect(result.status).toBe("unsupported_facts");
    expect(result.keepSearchOpen).toBe(true);
    expect(result.message).toBe(UNSUPPORTED_FACTS_RETRY_MESSAGE);
    expect(result.message).toMatch(/Leftover <date>\/<identifier>\/<number>/);
    expect(result.message).not.toMatch(/or use angle-bracket placeholders/i);
  });
});

describe("groundTableOperation explicit insert keep", () => {
  it("keeps a chat date on go-ahead insert and still cites the page", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 1,
        attachmentId: "att-urs",
        quote: "User Requirement Specification cover. Document No. URS/GLR-1301.",
      },
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 3,
        attachmentId: "att-urs",
        quote: [
          "APPROVAL SHEET",
          "Approved by Quality Assurance",
          "Date of Approval 30-06-2025",
        ].join("\n"),
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 4,
            rowKey: "URS",
            rowContext: "URS User Requirement Specification",
            insertText:
              "30-06-2025 [User Requirement Specification.PDF, p. 1]",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: {
        section: "qsr_qualification_documents",
        latestUserMessageText: "go ahead and insert that",
        recentAssistantTexts: [
          "Yes, the URS approval sheet has 30-06-2025.",
        ],
      },
    });
    expect(result.blocked).toBe(false);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).toContain("30-06-2025");
    expect(cell).not.toContain("<date>");
    const dateClaim = result.provenance.claims.find(
      (claim) => claim.kind === "date"
    );
    expect(dateClaim?.status).toBe("citation_moved");
    expect(dateClaim?.source?.page).toBe(3);
  });

  it("still drops an invented date on a first-pass draft", () => {
    const ledger = ledgerFromPages([
      {
        filename: "User Requirement Specification.PDF",
        pageNumber: 3,
        attachmentId: "att-urs",
        quote: "APPROVAL SHEET Date of Approval 30-06-2025",
      },
    ]);
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 4,
            rowKey: "URS",
            rowContext: "URS User Requirement Specification",
            insertText: "01-01-2099",
          },
        ],
      },
      ledger,
      policy: "block",
      grounding: {
        section: "qsr_qualification_documents",
        latestUserMessageText: "draft section 3",
      },
    });
    expect(result.blocked).toBe(true);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).not.toContain("01-01-2099");
  });
});

describe("CVP 24.50 m² assistant-echo keep", () => {
  const pipingQuote =
    "Jacket piping size 3.6 inch inlet. Outlet 14.1. Coil installed.";
  const invented =
    "24.50 m² [Installation Qualification.PDF, p. 24]";

  it("blocks 24.50 m² when the IQ page only prints piping sizes, even if the assistant already said it", () => {
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 2,
            rowKey: "URS-62",
            rowContext: "URS-62 Heat Transfer Area NLT 25.0 m²",
            insertText: invented,
          },
        ],
      },
      ledger: ledgerFromPages([
        {
          filename: "Installation Qualification.PDF",
          pageNumber: 24,
          attachmentId: "att-iq",
          quote: pipingQuote,
        },
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 12,
          attachmentId: "att-urs",
          quote: "URS-62 Heat Transfer Area NLT 25.0 m² for the jacket.",
        },
      ]),
      policy: "block",
      grounding: {
        section: "qsr_rtm_process",
        tableCol: 2,
        latestUserMessageText: "fill table 6 from the IQ",
        recentAssistantTexts: [
          "Heat transfer area is 24.50 m² [Installation Qualification.PDF, p. 24].",
        ],
      },
    });
    expect(result.blocked).toBe(true);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).not.toContain("24.50");
    expect(cell).toContain("<number>");
  });

  it("still keeps 24.50 m² on an explicit go-ahead insert", () => {
    const result = groundTableOperation({
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          {
            row: 1,
            col: 2,
            rowKey: "URS-62",
            rowContext: "URS-62 Heat Transfer Area",
            insertText: invented,
          },
        ],
      },
      ledger: ledgerFromPages([
        {
          filename: "Installation Qualification.PDF",
          pageNumber: 24,
          attachmentId: "att-iq",
          quote: pipingQuote,
        },
      ]),
      policy: "block",
      grounding: {
        section: "qsr_rtm_process",
        tableCol: 2,
        latestUserMessageText: "go ahead and insert that",
        recentAssistantTexts: [
          "Heat transfer area is 24.50 m² [Installation Qualification.PDF, p. 24].",
        ],
      },
    });
    expect(result.blocked).toBe(false);
    const cell =
      result.operation.kind === "edit_cells"
        ? result.operation.cells[0]!.insertText
        : "";
    expect(cell).toContain("24.50 m²");
    expect(cell).not.toContain("<number>");
  });
});

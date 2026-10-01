/**
 * Gold cases for the evidence-backed fact gate. The first case replays the
 * 2026-09-14 MJ ELR media-fill incident (Langfuse
 * c4d8a8356fbb3781af96c409408e3f01): Purpose/Scope p. 2 was cited for APS
 * facts that were not on that page, and media-fill IDs were invented.
 */
export type GroundednessGoldCase = {
  id: string;
  policy: "block" | "flag";
  pages: Array<{
    filename: string;
    pageNumber: number;
    attachmentId: string;
    quote: string;
  }>;
  draft: string;
  expectBlocked: boolean;
  expectUnsourced: string[];
  expectVerified: string[];
  expectCitationMoved?: string[];
};

const PQR = "PQR-24-PR-102.pdf";

const PURPOSE_SCOPE_P2 = `1.0 Purpose
This Periodic Quality Review covers Isolator Filling Machine E/PR/070 and
Isolator Filling Machine E/PR/071 at the Hinjawadi drug product site.
2.0 Scope
The review period is 01 January 2024 to 31 December 2024.`;

const APS_P8 = `Aseptic process simulation MF-24-001: 14 days incubation, contaminated units 0.`;

export const GROUNDEDNESS_GOLD_CASES: GroundednessGoldCase[] = [
  {
    id: "elr-media-fill-purpose-scope-miscite",
    policy: "block",
    pages: [
      {
        filename: PQR,
        pageNumber: 2,
        attachmentId: "att-pqr",
        quote: PURPOSE_SCOPE_P2,
      },
    ],
    draft: `Media fill MF-25-VIAL-01 was executed on vial line E/PR/070 [PQR-24-PR-102.pdf, p. 2]. Contaminated units 0.`,
    expectBlocked: true,
    expectUnsourced: ["MF-25-VIAL-01", "0"],
    expectVerified: ["E/PR/070"],
  },
  {
    id: "elr-media-fill-flag-persists",
    policy: "flag",
    pages: [
      {
        filename: PQR,
        pageNumber: 2,
        attachmentId: "att-pqr",
        quote: PURPOSE_SCOPE_P2,
      },
    ],
    draft: `Media fill MF-25-VIAL-01 on E/PR/070 [PQR-24-PR-102.pdf, p. 2].`,
    expectBlocked: false,
    expectUnsourced: ["MF-25-VIAL-01"],
    expectVerified: ["E/PR/070"],
  },
  {
    id: "citation-moved-from-purpose-to-aps-page",
    policy: "block",
    pages: [
      {
        filename: PQR,
        pageNumber: 2,
        attachmentId: "att-pqr",
        quote: PURPOSE_SCOPE_P2,
      },
      {
        filename: PQR,
        pageNumber: 8,
        attachmentId: "att-pqr",
        quote: APS_P8,
      },
    ],
    draft: `APS duration 14 days [PQR-24-PR-102.pdf, p. 2].`,
    expectBlocked: false,
    expectUnsourced: [],
    expectVerified: [],
    expectCitationMoved: ["14 days"],
  },
];

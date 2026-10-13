import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  attachmentIndexFrom,
  citationResolveFindings,
} from "@/lib/review/checks/citations-resolves";
import { uncitedFactFindings } from "@/lib/review/checks/citations-uncited";
import { externalRefFindings } from "@/lib/review/checks/citations-external";

function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function cell(type: "tableHeader" | "tableCell", text: string): JSONContent {
  return {
    type,
    content: [para(text)],
  };
}

function tableDoc(headers: string[], rows: string[][]): JSONContent {
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: headers.map((header) => cell("tableHeader", header)),
      },
      ...rows.map((row) => ({
        type: "tableRow" as const,
        content: row.map((value) => cell("tableCell", value)),
      })),
    ],
  };
}

const sections = {
  define: {
    narrative: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Batch BN-99 failed on 12 Jan 2024 [1]. SOP/QA/012 was not followed.",
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [missing-file.pdf, p. 2]" }],
        },
      ],
    },
  },
};

describe("citation review checks", () => {
  it("flags a marker whose Citations line does not resolve to a ready page", () => {
    const findings = citationResolveFindings(
      { documentType: "investigation_report", sections },
      attachmentIndexFrom([])
    );
    expect(findings.some((row) => row.message.includes("[1]"))).toBe(true);
    expect(findings.every((row) => row.severity === "critical")).toBe(true);
  });

  it("accepts a ready attachment page", () => {
    const findings = citationResolveFindings(
      { documentType: "investigation_report", sections },
      attachmentIndexFrom([{ filename: "missing-file.pdf", pageNumber: 2 }])
    );
    expect(findings).toEqual([]);
  });

  it("treats a vault filename's extracted page as ready regardless of case", () => {
    const findings = citationResolveFindings(
      {
        documentType: "investigation_report",
        sections: {
          define: {
            narrative: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "The report covers qualification of GLR-1301 [1].",
                    },
                  ],
                },
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Citations:" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "1. [User Requirement Specification.PDF, p. 5]",
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      attachmentIndexFrom([
        {
          filename: "User Requirement Specification.PDF",
          pageNumber: 5,
        },
      ])
    );
    expect(findings).toEqual([]);
  });

  it("flags uncited hard facts", () => {
    const findings = uncitedFactFindings({
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Batch BN-99 failed on 12 Jan 2024." }],
              },
            ],
          },
        },
      },
    });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((row) => row.kind === "needs_human")).toBe(true);
    expect(findings.every((row) => row.severity === "major")).toBe(true);
  });

  it("does not flag a parked [n] date that maps through Citations to a page", () => {
    const findings = uncitedFactFindings({
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              para("Effective date 06-11-2025 [1]."),
              para("Citations:"),
              para("1. [Design Qualification.PDF, p. 1]"),
            ],
          },
        },
      },
    });
    expect(findings.map((row) => row.anchorText)).not.toContain("06-11-2025");
  });

  it("does not flag a table-row date when the citation is in another cell", () => {
    const findings = uncitedFactFindings({
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              tableDoc(
                [
                  "Document Name",
                  "Effective Date / Approved date",
                  "Remarks",
                ],
                [
                  [
                    "Design Qualification",
                    "06-11-2025",
                    "[1]",
                  ],
                ]
              ),
              para("Citations:"),
              para("1. [Design Qualification.PDF, p. 1]"),
            ],
          },
        },
      },
    });
    expect(findings.map((row) => row.anchorText)).not.toContain("06-11-2025");
  });

  it("still flags a table date with no citation on that row", () => {
    const findings = uncitedFactFindings({
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              tableDoc(
                ["Document Name", "Effective Date / Approved date"],
                [["Design Qualification", "06-11-2025"]]
              ),
              para("Citations:"),
              para("1. [Design Qualification.PDF, p. 1]"),
            ],
          },
        },
      },
    });
    expect(findings.map((row) => row.anchorText)).toContain("06-11-2025");
  });

  it("flags SOP numbers that are not in the vault", () => {
    const findings = externalRefFindings({
      documentType: "investigation_report",
      sections,
      attachmentFilenames: ["unrelated.pdf"],
    });
    expect(findings.some((row) => row.anchorText.includes("SOP/QA/012"))).toBe(true);
    expect(findings.every((row) => row.severity === "major")).toBe(true);
  });
});

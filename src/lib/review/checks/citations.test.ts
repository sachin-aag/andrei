import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  attachmentIndexFrom,
  citationResolveFindings,
} from "@/lib/review/checks/citations-resolves";
import { uncitedFactFindings } from "@/lib/review/checks/citations-uncited";
import { externalRefFindings } from "@/lib/review/checks/citations-external";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { applySuggestionToContent } from "@/lib/suggestions/accept-suggestion";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { acceptSuggestionMarksById } from "@/lib/tiptap/suggestion-inject";
import { finalizeNarrativeDocAfterSuggestion } from "@/lib/tiptap/finalize-narrative-doc";
import type { CommentRecord } from "@/types/report";

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

const misplacedDoc: JSONContent = {
  type: "doc",
  content: [
    tableDoc(["Equipment", "IQ"], [["GLR-1302", "IQP/GLR-1302-00 [1]"]]),
    para("Citations:"),
    {
      type: "orderedList",
      content: [{ type: "listItem", content: [para("[ISM3 CV data sheet.xlsx, p. 3]")] }],
    },
    para("Inference: All equipment is qualified [1]."),
  ],
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

  it("proposes a <citation> placeholder for a marker with no Citations line", () => {
    const findings = citationResolveFindings(
      {
        documentType: "investigation_report",
        sections: {
          define: {
            narrative: {
              type: "doc",
              content: [
                para("Batch BN-99 failed on 12 Jan 2024 [1, 2]."),
                para("Citations:"),
                para("1. [protocol.pdf, p. 2]"),
              ],
            },
          },
        },
      },
      attachmentIndexFrom([{ filename: "protocol.pdf", pageNumber: 2 }])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "fixable",
      severity: "critical",
      metadata: {
        citationNumber: 2,
        focusText: "[1, 2]",
        proposedEdit: {
          kind: "ai_fix",
          deleteText: "[1, 2]",
          insertText: "[1] <citation>",
        },
      },
    });
  });

  it("rewrites a loose `[1] file` Citations line once instead of dropping the markers", () => {
    const findings = citationResolveFindings(
      {
        documentType: "investigation_report",
        sections: {
          define: {
            narrative: {
              type: "doc",
              content: [
                para("Residues stay below the acceptance limits [1]."),
                para("Results comply with the protocol limits [1]."),
                para("Citations"),
                para("[1] cleaning-sop.pdf, p. 2"),
              ],
            },
          },
        },
      },
      attachmentIndexFrom([{ filename: "cleaning-sop.pdf", pageNumber: 2 }])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "fixable",
      metadata: {
        citationNumber: 1,
        proposedEdit: {
          deleteText: "[1] cleaning-sop.pdf, p. 2",
          insertText: "1. [cleaning-sop.pdf, p. 2]",
        },
      },
    });
  });

  it("resolves markers against a Citations list that text follows and offers to move it", () => {
    const findings = citationResolveFindings(
      {
        documentType: "investigation_report",
        sections: {
          define: {
            narrative: misplacedDoc,
          },
        },
      },
      attachmentIndexFrom([{ filename: "ISM3 CV data sheet.xlsx", pageNumber: 3 }])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "fixable",
      severity: "major",
      metadata: {
        citationListMisplaced: true,
        proposedEdit: {
          deleteText:
            "Citations:\n[ISM3 CV data sheet.xlsx, p. 3]\nInference: All equipment is qualified [1].",
          insertText:
            "Inference: All equipment is qualified [1].\n\nCitations:\n1. [ISM3 CV data sheet.xlsx, p. 3]",
        },
      },
    });
    expect(findings.some((row) => row.message.includes("no matching line"))).toBe(false);

    const edit = findings[0]!.metadata!.proposedEdit as {
      anchorText: string;
      deleteText: string;
      insertText: string;
    };
    const comment = {
      id: "move-citations",
      reportId: "r1",
      parentId: null,
      sectionId: "s1",
      section: "define",
      authorId: "ai",
      content: serializeAiFixCommentContent({ ...edit, reasoning: "move" }),
      anchorText: edit.anchorText,
      contentPath: "narrative",
      fromPos: null,
      toPos: null,
      status: "open",
      kind: "ai_fix",
      source: "ai",
      externalAuthorName: null,
      externalAuthorInitials: null,
      externalCommentId: null,
      externalCreatedAt: null,
      locked: false,
      evaluationId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    } as CommentRecord;
    const applied = applySuggestionToContent({
      section: "define",
      comment,
      sectionContent: { narrative: misplacedDoc },
      applyMode: "tracked_change",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const accepted = finalizeNarrativeDocAfterSuggestion(
      acceptSuggestionMarksById(applied.nextSection.narrative as JSONContent, comment.id)
    );
    expect(flattenForAnchor(accepted).text).toBe(
      "Equipment\nIQ\nGLR-1302\nIQP/GLR-1302-00 [1]\nInference: All equipment is qualified [1].\n\nCitations:\n1. [ISM3 CV data sheet.xlsx, p. 3]"
    );
  });

  it("flags a misplaced Citations list without an edit when a table follows it", () => {
    const findings = citationResolveFindings(
      {
        documentType: "investigation_report",
        sections: {
          define: {
            narrative: {
              type: "doc",
              content: [
                para("Residues stay below the limits [1]."),
                para("Citations:"),
                para("1. [cleaning-sop.pdf, p. 2]"),
                tableDoc(["Swab", "Result"], [["S-1", "Pass"]]),
              ],
            },
          },
        },
      },
      attachmentIndexFrom([{ filename: "cleaning-sop.pdf", pageNumber: 2 }])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("needs_human");
    expect(findings[0]!.metadata?.citationListMisplaced).toBe(true);
    expect(findings[0]!.metadata?.proposedEdit).toBeUndefined();
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

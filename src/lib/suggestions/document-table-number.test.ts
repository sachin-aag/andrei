import { describe, expect, it } from "vitest";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import {
  ELR_MEDIA_FILL_HEADERS,
  ELR_MONITORING_HEADERS,
  EMPTY_ELR_CONTENT,
} from "@/lib/document-types/elr/sections";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { documentContentsFromReportState } from "@/lib/suggestions/document-table-number";
import {
  applyTableOperation,
  filledTableNumberInDocument,
} from "@/lib/suggestions/table-operation";
import type { CommentRecord } from "@/types/report";

function tableComment(args: {
  id: string;
  section: CommentRecord["section"];
  operation: {
    kind: "edit_cells";
    tableIndex: number;
    cells: { row: number; col: number; insertText: string }[];
  };
}): CommentRecord {
  return {
    id: args.id,
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: args.section,
    authorId: "ai",
    content: serializeAiFixCommentContent({
      deleteText: "",
      insertText: "",
      reasoning: "fill",
      tableOperation: args.operation,
    }),
    anchorText: "fill",
    contentPath: "table",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "app",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-09-15T00:00:00.000Z",
  };
}

describe("documentContentsFromReportState", () => {
  it("overlays a pending Media Fill fill so Monitoring is Table 3 with Abbreviations", () => {
    const mediaFillComment = tableComment({
      id: "media-fill",
      section: "elr_media_fill",
      operation: {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "APS-1" }],
      },
    });
    const contents = documentContentsFromReportState({
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
        elr_media_fill: {
          narrative: { type: "doc", content: [] },
          table: seededTableDoc([...ELR_MEDIA_FILL_HEADERS]),
        },
        elr_monitoring: EMPTY_ELR_CONTENT.elr_monitoring,
      },
      comments: [mediaFillComment],
      exceptCommentId: "monitoring",
    });
    expect(
      filledTableNumberInDocument({
        contents,
        target: {
          section: "elr_monitoring",
          targetField: "table",
          tableIndex: 0,
        },
      })
    ).toBe(3);
  });

  it("numbers Monitoring as Table 2 when only Abbreviations is filled", () => {
    const fill = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      {
        section: "elr_monitoring",
        targetField: "table",
        documentContents: documentContentsFromReportState({
          documentType: "equipment_lifecycle_report",
          sections: {
            elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
            elr_monitoring: EMPTY_ELR_CONTENT.elr_monitoring,
          },
          comments: [],
          exceptCommentId: "monitoring",
        }),
      }
    );
    expect(fill.ok).toBe(true);
    if (!fill.ok) return;
    expect(fill.tableNumber).toBe(2);
  });
});

import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { QSR_RTM_HEADERS } from "@/lib/document-types/qsr/sections";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import {
  applyTableOperation,
  summarizeTableOperation,
  type TableCellEdit,
  type TableOperation,
} from "@/lib/suggestions/table-operation";
import { buildTableOperationPreviewDoc } from "@/lib/suggestions/table-preview";
import {
  suggestionStaleMessage,
  validateSuggestionLocate,
} from "@/lib/suggestions/validate-suggestion";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

/**
 * TDD contract for the production Table 5 screenshot:
 * a 23-cell dummy-row `edit_cells` card on `qsr_rtm_process` / `table`,
 * two Gross Vessel Volume cells already filled, inline marks missing,
 * stale banner "The document changed after this suggestion was created…".
 *
 * Inject (`tiptap-section-field.tsx`) only paints when `validation.canPreview`.
 * The card banner (`suggestion-card.tsx`) shows when `!validation.canApply`.
 */

const STAGE_COL = 3;
const SECTION_COL = 4;
const REMARKS_COL = 5;

const URS_IDS = [
  "URS-1",
  "URS-2",
  "URS-3",
  "URS-4",
  "URS-5",
  "URS-13",
  "URS-21",
  "URS-22",
  "URS-23",
  "URS-64",
  "URS-70",
] as const;

const PREVIEW_ATTRS = {
  id: "c-table-5",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-09-27T00:00:00.000Z",
  kind: "fix" as const,
};

const STALE_BANNER =
  "The document changed after this suggestion was created and the edit no longer fits. Dismiss it or run Suggest fixes again.";

const APPLY_CONTEXT = {
  section: "qsr_rtm_process" as const,
  targetField: "table",
};

function textCell(
  type: "tableHeader" | "tableCell",
  text: string
): JSONContent {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined,
      },
    ],
  };
}

function rtmRow(
  id: (typeof URS_IDS)[number],
  extras?: { stage?: string; section?: string; remarks?: string }
): string[] {
  const parameter = id === "URS-1" ? "Gross Vessel Volume" : "Parameter";
  const requirement = id === "URS-1" ? "3.0 KL" : `${id} text`;
  return [
    id,
    parameter,
    requirement,
    extras?.stage ?? "",
    extras?.section ?? "",
    extras?.remarks ?? "",
  ];
}

function table5Doc(
  extrasById: Partial<
    Record<(typeof URS_IDS)[number], { stage?: string; section?: string; remarks?: string }>
  > = {}
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: QSR_RTM_HEADERS.map((h) => textCell("tableHeader", h)),
          },
          ...URS_IDS.map((id) => ({
            type: "tableRow" as const,
            content: rtmRow(id, extrasById[id]).map((c) =>
              textCell("tableCell", c)
            ),
          })),
        ],
      },
    ],
  };
}

function liveTableAfterTwoCellsLanded(): JSONContent {
  return table5Doc({
    "URS-1": { stage: "PQ [28]", section: "2.4" },
  });
}

function dummyRowFillCells(): TableCellEdit[] {
  const cells: TableCellEdit[] = [];
  for (const id of URS_IDS) {
    cells.push({
      row: 1,
      col: STAGE_COL,
      rowKey: id,
      expectedText: "",
      insertText: "IQ",
    });
    cells.push({
      row: 1,
      col: SECTION_COL,
      rowKey: id,
      expectedText: "",
      insertText: id === "URS-1" ? "13.1" : `${id}-section`,
    });
  }
  cells.push({
    row: 1,
    col: REMARKS_COL,
    rowKey: "URS-13",
    expectedText: "",
    insertText: "Complies",
  });
  return cells;
}

function table5Operation(): TableOperation {
  return {
    kind: "edit_cells",
    tableIndex: 0,
    cells: dummyRowFillCells(),
  };
}

function table5Comment(
  operation: TableOperation = table5Operation(),
  extras?: { second?: { anchorText: string; deleteText: string; insertText: string } }
): CommentRecord {
  return {
    id: PREVIEW_ATTRS.id,
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "qsr_rtm_process",
    authorId: "ai",
    anchorText: "",
    contentPath: "table",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    evaluationId: "e1",
    createdAt: PREVIEW_ATTRS.createdAt,
    source: "app",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    content: serializeAiFixCommentContent({
      deleteText: "",
      insertText: "",
      reasoning: "Fill missing Stage / Section cells in Table 5",
      tableOperation: operation,
      second: extras?.second,
    }),
  };
}

function cellText(doc: JSONContent, row: number, col: number): string {
  const table = (doc.content ?? []).find((n) => n.type === "table")!;
  const rows = (table.content ?? []).filter((n) => n.type === "tableRow");
  const cells = (rows[row]!.content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  );
  return flattenForAnchor(cells[col]!).text.replace(/\s+/g, " ").trim();
}

function cellRuns(
  doc: JSONContent,
  row: number,
  col: number
): Array<{ text: string; insert: boolean; deleted: boolean }> {
  const table = (doc.content ?? []).find((n) => n.type === "table")!;
  const rows = (table.content ?? []).filter((n) => n.type === "tableRow");
  const cells = (rows[row]!.content ?? []).filter(
    (n) => n.type === "tableCell" || n.type === "tableHeader"
  );
  const runs: Array<{ text: string; insert: boolean; deleted: boolean }> = [];
  const walk = (node: JSONContent) => {
    if (node.type === "text" && node.text) {
      const marks = node.marks ?? [];
      runs.push({
        text: node.text,
        insert: marks.some((m) => m.type === suggestionInsertMarkName),
        deleted: marks.some((m) => m.type === suggestionDeleteMarkName),
      });
      return;
    }
    node.content?.forEach(walk);
  };
  walk(cells[col]!);
  return runs;
}

function ursRowIndex(id: (typeof URS_IDS)[number]): number {
  return URS_IDS.indexOf(id) + 1;
}

function wouldInjectInline(canPreview: boolean): boolean {
  return canPreview;
}

function wouldShowStaleBanner(canApply: boolean, documentChanged: boolean): string {
  return !canApply
    ? suggestionStaleMessage({
        locateStatus: documentChanged ? "not_found" : "locatable",
        documentChanged,
        canApply,
        canPreview: false,
        mergeStatus: documentChanged ? "legacy" : "noop",
      })
    : "";
}

describe("Table 5 23-cell dummy-row fill (production screenshot)", () => {
  it("is a 23-cell TABLE EDIT card", () => {
    const operation = table5Operation();
    expect(operation.cells).toHaveLength(23);
    expect(summarizeTableOperation(operation)).toBe("Update 23 table cells");
  });

  it("applies the empty remainder without overwriting Gross Vessel Volume", () => {
    const live = liveTableAfterTwoCellsLanded();
    const result = applyTableOperation(live, table5Operation(), APPLY_CONTEXT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(cellText(result.doc, ursRowIndex("URS-1"), STAGE_COL)).toBe("PQ [28]");
    expect(cellText(result.doc, ursRowIndex("URS-1"), SECTION_COL)).toBe("2.4");
    expect(cellText(result.doc, ursRowIndex("URS-13"), STAGE_COL)).toBe("IQ");
    expect(cellText(result.doc, ursRowIndex("URS-13"), SECTION_COL)).toBe(
      "URS-13-section"
    );
    expect(cellText(result.doc, ursRowIndex("URS-13"), REMARKS_COL)).toBe(
      "Complies"
    );
    expect(cellText(result.doc, ursRowIndex("URS-64"), STAGE_COL)).toBe("IQ");
    expect(cellText(result.doc, ursRowIndex("URS-70"), SECTION_COL)).toBe(
      "URS-70-section"
    );
  });

  it("stays previewable so inline marks inject and the card is not stale", () => {
    const live = liveTableAfterTwoCellsLanded();
    const comment = table5Comment();
    const v = validateSuggestionLocate(comment, "qsr_rtm_process", {
      table: live,
    });

    expect(v.locateStatus).toBe("locatable");
    expect(v.documentChanged).toBe(false);
    expect(v.canApply).toBe(true);
    expect(v.canPreview).toBe(true);
    expect(wouldInjectInline(v.canPreview)).toBe(true);
    expect(wouldShowStaleBanner(v.canApply, v.documentChanged)).toBe("");
    expect(suggestionStaleMessage(v)).not.toBe(STALE_BANNER);
  });

  it("paints insert marks on empty URS cells, not on the filled Gross Vessel Volume cells", () => {
    const live = liveTableAfterTwoCellsLanded();
    const preview = buildTableOperationPreviewDoc(
      live,
      table5Operation(),
      PREVIEW_ATTRS,
      APPLY_CONTEXT
    );

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    expect(cellRuns(preview.doc, ursRowIndex("URS-1"), STAGE_COL)).toEqual([
      { text: "PQ [28]", insert: false, deleted: false },
    ]);
    expect(cellRuns(preview.doc, ursRowIndex("URS-1"), SECTION_COL)).toEqual([
      { text: "2.4", insert: false, deleted: false },
    ]);
    expect(cellRuns(preview.doc, ursRowIndex("URS-13"), STAGE_COL)).toEqual([
      { text: "IQ", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, ursRowIndex("URS-13"), REMARKS_COL)).toEqual([
      { text: "Complies", insert: true, deleted: false },
    ]);
    expect(cellRuns(preview.doc, ursRowIndex("URS-64"), STAGE_COL)).toEqual([
      { text: "IQ", insert: true, deleted: false },
    ]);
  });

  it("still previews after TipTap has already painted the remainder", () => {
    const live = liveTableAfterTwoCellsLanded();
    const preview = buildTableOperationPreviewDoc(
      live,
      table5Operation(),
      PREVIEW_ATTRS,
      APPLY_CONTEXT
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const v = validateSuggestionLocate(table5Comment(), "qsr_rtm_process", {
      table: preview.doc,
    });
    expect(v.canPreview).toBe(true);
    expect(v.canApply).toBe(true);
    expect(v.documentChanged).toBe(false);
    expect(wouldInjectInline(v.canPreview)).toBe(true);
    expect(suggestionStaleMessage(v)).not.toBe(STALE_BANNER);
  });

  it("does not mark the table card stale when Citations: second fails to locate", () => {
    const live = liveTableAfterTwoCellsLanded();
    const comment = table5Comment(table5Operation(), {
      second: {
        anchorText: "",
        deleteText: "",
        insertText: "\n\nCitations:\n[1] IQ protocol.pdf, p. 28",
      },
    });
    const v = validateSuggestionLocate(comment, "qsr_rtm_process", {
      table: live,
    });
    expect(v.canPreview).toBe(true);
    expect(v.canApply).toBe(true);
    expect(v.documentChanged).toBe(false);
    expect(wouldInjectInline(v.canPreview)).toBe(true);
    expect(suggestionStaleMessage(v)).not.toBe(STALE_BANNER);
  });
});

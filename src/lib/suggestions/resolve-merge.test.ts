import { describe, expect, it } from "vitest";
import {
  applySuggestionToContent,
} from "@/lib/suggestions/accept-suggestion";
import { buildSuggestionRecord, withSuggestionRecord } from "@/lib/suggestions/suggestion-record";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { MECHANICAL_RESULTS_HEADERS } from "@/lib/document-types/mechanical/sections";
import { extractRawRows } from "@/lib/document-types/design-verification/matrix-parser";
import { applyTableOperation } from "@/lib/suggestions/table-operation";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { doc, para } from "@/lib/suggestions/merge-fixtures";
import type { CommentRecord } from "@/types/report";
import { resolveSuggestionMerge, injectMergePreview } from "@/lib/suggestions/resolve-merge";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

const sectionContent = {
  narrative: doc(para("The assay failed at 68 percent.")),
};

function commentWithRecord(): CommentRecord {
  const record = buildSuggestionRecord({
    sectionContent,
    section: "define",
    targetField: "narrative",
    documentType: "investigation_report",
    input: {
      kind: "located",
      edit: {
        anchorText: "68 percent",
        deleteText: "68 percent",
        insertText: "68 percent versus the 80 percent limit",
      },
    },
  });
  return {
    id: "c-merge",
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content: serializeAiFixCommentContent(
      withSuggestionRecord(
        {
          deleteText: "68 percent",
          insertText: "68 percent versus the 80 percent limit",
          reasoning: "Name the spec.",
        },
        record
      )
    ),
    anchorText: "68 percent",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    source: "ai",
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
  };
}

describe("resolveSuggestionMerge / apply", () => {
  it("applies a stored record against an unchanged field", () => {
    const comment = commentWithRecord();
    const resolved = resolveSuggestionMerge({
      section: "define",
      comment,
      sectionContent,
    });
    expect(resolved.merge?.status).toBe("clean");
    const applied = applySuggestionToContent({
      section: "define",
      comment,
      sectionContent,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const text = richJsonToPlainText(
      (applied.nextSection.narrative as { type: string }) &&
        (applied.nextSection.narrative as import("@tiptap/core").JSONContent)
    );
    expect(text).toContain("80 percent");
  });

  it("keeps the engineer's wording on a conflicting paragraph and still applies", () => {
    const current = {
      narrative: doc(para("The assay failed at 72 percent.")),
    };
    const comment: CommentRecord = {
      ...commentWithRecord(),
      content: serializeAiFixCommentContent(
        withSuggestionRecord(
          {
            deleteText: "68 percent",
            insertText: "61 percent",
            reasoning: "Different number.",
          },
          {
            base: sectionContent.narrative,
            intent: doc(para("The assay failed at 61 percent.")),
          }
        )
      ),
    };
    const resolved = resolveSuggestionMerge({
      section: "define",
      comment,
      sectionContent: current,
    });
    expect(resolved.merge?.status).toBe("conflict");
    const applied = applySuggestionToContent({
      section: "define",
      comment,
      sectionContent: current,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.remainder).toBe("conflict");
    const text = richJsonToPlainText(
      applied.nextSection.narrative as import("@tiptap/core").JSONContent
    );
    expect(text).toContain("72 percent");
    expect(text).not.toContain("61 percent");
  });

  it("treats a no-op merge as already present", () => {
    const comment = commentWithRecord();
    const already = applySuggestionToContent({
      section: "define",
      comment,
      sectionContent,
    });
    expect(already.ok).toBe(true);
    if (!already.ok) return;
    const again = applySuggestionToContent({
      section: "define",
      comment,
      sectionContent: already.nextSection,
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toBe("noop");
  });
});

const PREVIEW_ATTRS = {
  id: "c-merge",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

function hasPreviewMarks(doc: import("@tiptap/core").JSONContent, id: string): boolean {
  const walk = (node: import("@tiptap/core").JSONContent): boolean => {
    if (
      node.marks?.some(
        (mark) =>
          (mark.type === "suggestionInsert" || mark.type === "suggestionDelete") &&
          (mark.attrs as { id?: string } | undefined)?.id === id
      )
    ) {
      return true;
    }
    return Boolean(node.content?.some(walk));
  };
  return walk(doc);
}

describe("injectMergePreview", () => {
  it("paints insert-only wording that merge ops cannot locate as a before/after", () => {
    const current = doc(
      para("The assay failed at 68 percent versus the specification.")
    );
    const intent = doc(
      para(
        "The assay failed at 68 percent versus the 80 percent specification."
      )
    );
    const resolved = resolveSuggestionMerge({
      section: "define",
      comment: {
        ...commentWithRecord(),
        content: serializeAiFixCommentContent(
          withSuggestionRecord(
            {
              deleteText: "",
              insertText: " 80 percent",
              reasoning: "Name the spec.",
            },
            { base: current, intent }
          )
        ),
        anchorText: "versus the specification",
      },
      sectionContent: { narrative: current },
    });
    expect(resolved.merge?.status).toBe("clean");
    expect(
      resolved.operations.every((op) => op.classification === "edit")
    ).toBe(true);

    const preview = injectMergePreview({
      current,
      intent,
      operations: resolved.operations,
      wholeField: resolved.wholeField,
      attrs: PREVIEW_ATTRS,
    });
    expect(hasPreviewMarks(preview, PREVIEW_ATTRS.id)).toBe(true);
  });

  it("still locates a unique replace as tight inline marks", () => {
    const current = sectionContent.narrative;
    const comment = commentWithRecord();
    const resolved = resolveSuggestionMerge({
      section: "define",
      comment,
      sectionContent,
    });
    const record = JSON.parse(comment.content) as {
      suggestionIntent: import("@tiptap/core").JSONContent;
    };
    const preview = injectMergePreview({
      current,
      intent: record.suggestionIntent,
      operations: resolved.operations,
      wholeField: false,
      attrs: PREVIEW_ATTRS,
    });
    expect(hasPreviewMarks(preview, PREVIEW_ATTRS.id)).toBe(true);
    const text = richJsonToPlainText(preview);
    expect(text).toContain("68 percent");
    expect(text).toContain("80 percent");
    // Tight locate, not a whole-field before/after (which concatenates two paras).
    expect(preview.content).toHaveLength(1);
  });

  it("does not use insertText as an anchor (that string is not in the live doc)", () => {
    const current = doc(
      para("The assay failed at 68 percent versus the specification.")
    );
    const intent = doc(
      para(
        "The assay failed at 68 percent versus the 80 percent specification."
      )
    );
    const preview = injectMergePreview({
      current,
      intent,
      operations: [
        {
          opIndex: 0,
          blockId: "p0",
          kind: "replace_block",
          classification: "edit",
          coverage: 0.1,
          deleteText: "",
          insertText: "80 percent",
        },
      ],
      wholeField: false,
      attrs: PREVIEW_ATTRS,
    });
    expect(hasPreviewMarks(preview, PREVIEW_ATTRS.id)).toBe(true);
  });
});

describe("resolveSuggestionMerge table operations", () => {
  it("does not use mergeField for stored tableOperation suggestions", () => {
    const baseSection = {
      hardwareTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
    };
    const operation = {
      kind: "edit_cells" as const,
      tableIndex: 0,
      cells: [
        { row: 1, col: 0, insertText: "M3-HRS-GN-001" },
        {
          row: 1,
          col: 1,
          insertText: "All Components shall be RoHS compliant",
        },
        { row: 1, col: 2, insertText: "See data sheets in Appendix A." },
        { row: 1, col: 3, insertText: "Pass" },
      ],
    };
    const record = buildSuggestionRecord({
      sectionContent: baseSection,
      section: "requirements_verified",
      targetField: "hardwareTable",
      documentType: "mechanical_design_verification",
      input: { kind: "table", operation },
    });
    expect(record).not.toBeNull();
    const comment: CommentRecord = {
      id: "c-table",
      reportId: "r1",
      parentId: null,
      sectionId: "s1",
      section: "requirements_verified",
      authorId: "ai",
      content: serializeAiFixCommentContent(
        withSuggestionRecord(
          {
            deleteText: "",
            insertText: "",
            reasoning: "Add requirement row",
            tableOperation: operation,
          },
          record
        )
      ),
      anchorText: "Insert requirement row",
      contentPath: "hardwareTable",
      fromPos: null,
      toPos: null,
      status: "open",
      kind: "ai_fix",
      source: "ai",
      evaluationId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      externalAuthorName: null,
      externalAuthorInitials: null,
      externalCommentId: null,
      externalCreatedAt: null,
      locked: false,
    };

    const resolved = resolveSuggestionMerge({
      section: "requirements_verified",
      comment,
      sectionContent: baseSection,
      fieldContentPath: "hardwareTable",
    });
    expect(resolved.merge).toBeNull();

    const applied = applySuggestionToContent({
      section: "requirements_verified",
      comment,
      sectionContent: baseSection,
      fieldContentPath: "hardwareTable",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const raw = extractRawRows(
      getRichFieldValue(applied.nextSection, "hardwareTable")
    );
    expect(raw).not.toHaveProperty("error");
    if ("error" in raw) return;
    expect(raw.headers).toEqual([...MECHANICAL_RESULTS_HEADERS]);
    expect(raw.dataRows).toHaveLength(1);
    expect(raw.dataRows[0]?.[0]).toBe("M3-HRS-GN-001");
    expect(raw.dataRows[0]?.[3]).toBe("Pass");
  });

  it("applies tableOperation when the engineer edited a cell first", () => {
    const baseSection = {
      hardwareTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
    };
    const diverged = applyTableOperation(
      baseSection.hardwareTable,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "TYPED-BY-ENGINEER" }],
      },
      { section: "requirements_verified", targetField: "hardwareTable" }
    );
    expect(diverged.ok).toBe(true);
    if (!diverged.ok) return;
    const sectionContent = { hardwareTable: diverged.doc };

    const operation = {
      kind: "insert_rows" as const,
      tableIndex: 0,
      afterRow: 1,
      rows: [
        [
          "M3-HRS-GN-001",
          "All Components shall be RoHS compliant",
          "See data sheets in Appendix A.",
          "Pass",
        ],
      ],
    };
    const record = buildSuggestionRecord({
      sectionContent: baseSection,
      section: "requirements_verified",
      targetField: "hardwareTable",
      documentType: "mechanical_design_verification",
      input: { kind: "table", operation },
    });
    const comment: CommentRecord = {
      id: "c-table-diverged",
      reportId: "r1",
      parentId: null,
      sectionId: "s1",
      section: "requirements_verified",
      authorId: "ai",
      content: serializeAiFixCommentContent(
        withSuggestionRecord(
          {
            deleteText: "",
            insertText: "",
            reasoning: "Add requirement row",
            tableOperation: operation,
          },
          record
        )
      ),
      anchorText: "Insert requirement row",
      contentPath: "hardwareTable",
      fromPos: null,
      toPos: null,
      status: "open",
      kind: "ai_fix",
      source: "ai",
      evaluationId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      externalAuthorName: null,
      externalAuthorInitials: null,
      externalCommentId: null,
      externalCreatedAt: null,
      locked: false,
    };

    const applied = applySuggestionToContent({
      section: "requirements_verified",
      comment,
      sectionContent,
      fieldContentPath: "hardwareTable",
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const raw = extractRawRows(
      getRichFieldValue(applied.nextSection, "hardwareTable")
    );
    expect(raw).not.toHaveProperty("error");
    if ("error" in raw) return;
    expect(raw.headers).toEqual([...MECHANICAL_RESULTS_HEADERS]);
    expect(raw.dataRows).toHaveLength(2);
    expect(raw.dataRows.some((row) => row[0] === "M3-HRS-GN-001")).toBe(true);
    expect(raw.dataRows.some((row) => row[0] === "TYPED-BY-ENGINEER")).toBe(true);
  });
});

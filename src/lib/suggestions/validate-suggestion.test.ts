import { describe, expect, it } from "vitest";
import type { CommentRecord } from "@/types/report";
import {
  countStaleOpenSuggestions,
  fieldContentHash,
  firstPreviewableOpenSuggestion,
  preferredOpenSuggestion,
  reviewOrderOpenSuggestions,
  validateSuggestionLocate,
} from "./validate-suggestion";
import {
  serializeAiFixCommentContent,
  serializeAiRedraftCommentContent,
  parseAiFixCommentContent,
} from "@/lib/ai/suggestion-gating";
import { sectionContentHash } from "@/lib/ai/suggestion-gating";

function aiFixComment(
  overrides: Partial<CommentRecord> & { content: string }
): CommentRecord {
  return {
    id: "c1",
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    anchorText: "hello",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: "open",
    kind: "ai_fix",
    evaluationId: "e1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
    source: overrides.source ?? "app",
    externalAuthorName: overrides.externalAuthorName ?? null,
    externalAuthorInitials: overrides.externalAuthorInitials ?? null,
    externalCommentId: overrides.externalCommentId ?? null,
    externalCreatedAt: overrides.externalCreatedAt ?? null,
    locked: overrides.locked ?? false,
  };
}

describe("validateSuggestionLocate", () => {
  const sectionContent = {
    narrative: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "On 15/05/2025, hello world." }],
        },
      ],
    },
  };

  it("returns locatable when anchor matches uniquely", () => {
    const comment = aiFixComment({
      anchorText: "hello",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " there",
        reasoning: "",
      }),
    });
    const v = validateSuggestionLocate(comment, "define", sectionContent);
    expect(v.locateStatus).toBe("locatable");
    expect(v.canApply).toBe(true);
  });

  it("returns locatable for a split body edit plus end citation", () => {
    const comment = aiFixComment({
      anchorText: "hello",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " there",
        reasoning: "",
        second: {
          anchorText: "",
          deleteText: "",
          insertText: "[protocol.pdf, p. 3]",
        },
      }),
    });
    const v = validateSuggestionLocate(comment, "define", sectionContent);
    expect(v.locateStatus).toBe("locatable");
    expect(v.canApply).toBe(true);
  });

  it("returns not_found after delete target is removed", () => {
    const comment = aiFixComment({
      anchorText: "missing",
      content: serializeAiFixCommentContent({
        deleteText: "missing",
        insertText: "replacement",
        reasoning: "",
      }),
    });
    const v = validateSuggestionLocate(comment, "define", sectionContent);
    expect(v.locateStatus).toBe("not_found");
    expect(v.canApply).toBe(false);
  });

  it("uses unique anchor context to disambiguate repeated delete text", () => {
    const content = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text:
                  "The acceptance criteria as per SOP/DP/QC/045 are clear. " +
                  "The narrative cites the SOP number (SOP/DP/QC/045) and the acceptance criteria, but not the governing section.",
              },
            ],
          },
        ],
      },
    };
    const comment = aiFixComment({
      anchorText:
        "The narrative cites the SOP number (SOP/DP/QC/045) and the acceptance criteria, but not the governing section.",
      content: serializeAiFixCommentContent({
        deleteText: "SOP/DP/QC/045",
        insertText: "SOP/DP/QC/045, section [Section number: <to be filled>]",
        reasoning: "",
      }),
    });

    const v = validateSuggestionLocate(comment, "define", content);

    expect(v.locateStatus).toBe("locatable");
    expect(v.canApply).toBe(true);
  });

  it("still reports ambiguous when the anchor context is repeated", () => {
    const repeated =
      "The narrative cites the SOP number (SOP/DP/QC/045) and the acceptance criteria.";
    const content = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `${repeated} ${repeated}` }],
          },
        ],
      },
    };
    const comment = aiFixComment({
      anchorText: repeated,
      content: serializeAiFixCommentContent({
        deleteText: "SOP/DP/QC/045",
        insertText: "SOP/DP/QC/045, section [Section number: <to be filled>]",
        reasoning: "",
      }),
    });

    const v = validateSuggestionLocate(comment, "define", content);

    expect(v.locateStatus).toBe("ambiguous");
    expect(v.canApply).toBe(false);
  });

  it("maps improve narrative comments to correctiveActions plain text", () => {
    const improveContent = {
      narrative: { type: "doc", content: [] },
      correctiveActions:
        "CA-1: Retrain operator. [Responsible person: <to be filled>]",
    };
    const comment = aiFixComment({
      section: "improve",
      contentPath: "narrative",
      anchorText: "CA-1:",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " Updated tracking.",
        reasoning: "",
      }),
    });
    const v = validateSuggestionLocate(
      comment,
      "improve",
      improveContent,
      "correctiveActions"
    );
    expect(v.locateStatus).toBe("locatable");
    expect(v.canPreview).toBe(true);
  });

  it("flags documentChanged when content hash differs from snapshot", () => {
    const hash = sectionContentHash("define", sectionContent);
    const comment = aiFixComment({
      anchorText: "hello",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " there",
        reasoning: "",
        contentHashAtSuggestion: hash,
      }),
    });
    const edited = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Completely different text." }],
          },
        ],
      },
    };
    const v = validateSuggestionLocate(comment, "define", edited);
    expect(v.documentChanged).toBe(true);
    expect(v.canApply).toBe(false);
  });
});

describe("validateSuggestionLocate — ai_redraft", () => {
  const improveContent = {
    narrative: { type: "doc", content: [] },
    correctiveActions: "CA-1: Retrain operator.",
  };

  function redraftComment(content: string, contentPath: string): CommentRecord {
    return aiFixComment({
      content,
      kind: "ai_redraft",
      contentPath,
      anchorText: "",
      section: "improve",
    });
  }

  it("is applicable and previewable", () => {
    const comment = redraftComment(
      serializeAiRedraftCommentContent({
        markdown: "New corrective actions.",
        reasoning: "",
        fieldHashAtSuggestion: fieldContentHash(
          "improve",
          improveContent,
          "correctiveActions"
        ),
      }),
      "correctiveActions"
    );
    const v = validateSuggestionLocate(comment, "improve", improveContent);
    expect(v.canApply).toBe(true);
    expect(v.canPreview).toBe(true);
    expect(v.documentChanged).toBe(false);
  });

  it("ignores changes to OTHER fields (per-field staleness)", () => {
    const comment = redraftComment(
      serializeAiRedraftCommentContent({
        markdown: "New corrective actions.",
        reasoning: "",
        fieldHashAtSuggestion: fieldContentHash(
          "improve",
          improveContent,
          "correctiveActions"
        ),
      }),
      "correctiveActions"
    );
    const otherFieldEdited = {
      ...improveContent,
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "A different narrative now." }],
          },
        ],
      },
    };
    const v = validateSuggestionLocate(comment, "improve", otherFieldEdited);
    expect(v.documentChanged).toBe(false);
    expect(v.canApply).toBe(true);
  });

  it("flags documentChanged when the TARGET field itself changed", () => {
    const comment = redraftComment(
      serializeAiRedraftCommentContent({
        markdown: "New corrective actions.",
        reasoning: "",
        fieldHashAtSuggestion: fieldContentHash(
          "improve",
          improveContent,
          "correctiveActions"
        ),
      }),
      "correctiveActions"
    );
    const targetFieldEdited = {
      ...improveContent,
      correctiveActions: "CA-1: Retrain operator. CA-2: Update SOP.",
    };
    const v = validateSuggestionLocate(comment, "improve", targetFieldEdited);
    expect(v.documentChanged).toBe(true);
    expect(v.canApply).toBe(true);
  });
});

describe("countStaleOpenSuggestions", () => {
  it("counts suggestions that no longer locate", () => {
    const sectionContent = {
      narrative: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Only one line." }],
          },
        ],
      },
    };
    const comments = [
      aiFixComment({
        id: "a",
        content: serializeAiFixCommentContent({
          deleteText: "gone",
          insertText: "x",
          reasoning: "",
        }),
      }),
      aiFixComment({
        id: "b",
        anchorText: "Only",
        content: serializeAiFixCommentContent({
          deleteText: "",
          insertText: " one",
          reasoning: "",
        }),
      }),
    ];
    const counts = countStaleOpenSuggestions(
      "define",
      comments,
      [],
      sectionContent
    );
    expect(counts.total).toBe(2);
    expect(counts.stale).toBe(1);
  });
});

function equipmentTable(manufacturer: string) {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Equipment" }] },
                ],
              },
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Manufacturer" }],
                  },
                ],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "UUT-1" }] },
                ],
              },
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: manufacturer }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("validateSuggestionLocate table operations", () => {
  const insertDescription = serializeAiFixCommentContent({
    deleteText: "",
    insertText: "",
    reasoning: "Add Description",
    tableOperation: {
      kind: "insert_column",
      tableIndex: 0,
      afterCol: 1,
      header: "Description",
      values: ["Dental laser"],
      expectedHeaderAtAfterCol: "Manufacturer",
      expectedHeaders: ["Equipment", "Manufacturer"],
    },
  });

  it("round-trips a tableOperation through the ai_fix payload", () => {
    const payload = parseAiFixCommentContent(insertDescription);
    expect(payload.tableOperation?.kind).toBe("insert_column");
    expect(payload.tableOperationInvalid).toBeUndefined();
    expect(parseAiFixCommentContent(serializeAiFixCommentContent(payload)).tableOperation).toEqual(
      payload.tableOperation
    );
  });

  it("stays applicable when an unrelated cell was filled", () => {
    const comment = aiFixComment({
      section: "define",
      contentPath: "narrative",
      anchorText: "",
      content: insertDescription,
    });
    const v = validateSuggestionLocate(comment, "define", {
      narrative: equipmentTable("Acme Corp"),
    });
    expect(v.locateStatus).toBe("locatable");
    expect(v.canApply).toBe(true);
  });

  it("marks the operation stale when the expected header changed", () => {
    const comment = aiFixComment({
      section: "define",
      contentPath: "narrative",
      anchorText: "",
      content: insertDescription,
    });
    const staleOp = serializeAiFixCommentContent({
      deleteText: "",
      insertText: "",
      reasoning: "Add Description",
      tableOperation: {
        kind: "insert_column",
        tableIndex: 0,
        afterCol: 1,
        header: "Description",
        values: ["Dental laser"],
        expectedHeaderAtAfterCol: "Maker",
        expectedHeaders: ["Equipment", "Maker"],
      },
    });
    const stale = validateSuggestionLocate(
      { ...comment, content: staleOp },
      "define",
      { narrative: equipmentTable("Acme Corp") }
    );
    expect(stale.canApply).toBe(false);
    expect(stale.documentChanged).toBe(true);
  });
});

describe("reviewOrderOpenSuggestions", () => {
  const sectionContent = {
    narrative: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "On 15/05/2025, hello world." }],
        },
      ],
    },
  };

  it("puts a locatable newer card ahead of a stale older sibling", () => {
    const stale = aiFixComment({
      id: "stale",
      createdAt: "2026-01-01T00:00:00.000Z",
      evaluationId: null,
      anchorText: "this sentence is gone",
      content: serializeAiFixCommentContent({
        deleteText: "this sentence is gone",
        insertText: "replacement",
        reasoning: "old rewrite",
      }),
    });
    const fresh = aiFixComment({
      id: "fresh",
      createdAt: "2026-01-02T00:00:00.000Z",
      evaluationId: null,
      anchorText: "hello",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " there",
        reasoning: "new edit",
      }),
    });

    const ordered = reviewOrderOpenSuggestions(
      "define",
      [stale, fresh],
      [],
      sectionContent
    );
    expect(ordered.map((c) => c.id)).toEqual(["fresh", "stale"]);
    expect(
      firstPreviewableOpenSuggestion("define", [stale, fresh], [], sectionContent)
        ?.id
    ).toBe("fresh");
  });

  it("prefers a focused open card over the locatable head", () => {
    const first = aiFixComment({
      id: "first",
      createdAt: "2026-01-01T00:00:00.000Z",
      evaluationId: null,
      anchorText: "On",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " shift A",
        reasoning: "line",
      }),
    });
    const second = aiFixComment({
      id: "second",
      createdAt: "2026-01-02T00:00:00.000Z",
      evaluationId: null,
      anchorText: "hello",
      content: serializeAiFixCommentContent({
        deleteText: "",
        insertText: " there",
        reasoning: "later shrink",
      }),
    });
    const focused = preferredOpenSuggestion({
      section: "define",
      comments: [first, second],
      evaluations: [],
      sectionContent,
      preferredCommentId: "second",
    });
    expect(focused.ordered.map((c) => c.id)).toEqual(["first", "second"]);
    expect(focused.active?.id).toBe("second");
    expect(focused.index).toBe(1);

    const fallback = preferredOpenSuggestion({
      section: "define",
      comments: [first, second],
      evaluations: [],
      sectionContent,
      preferredCommentId: "gone",
    });
    expect(fallback.active?.id).toBe("first");
    expect(fallback.index).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { SUGGESTION_THREE_WAY_MERGE } from "@/lib/suggestions/suggestion-merge-flag";
import {
  buildSuggestionRecord,
  mergeStoredSuggestion,
  readSuggestionRecord,
  withSuggestionRecord,
} from "@/lib/suggestions/suggestion-record";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { doc, para } from "@/lib/suggestions/merge-fixtures";

const sectionContent = {
  narrative: doc(para("The assay failed at 68 percent.")),
};

describe("suggestion record (dual-read)", () => {
  it("keeps the three-way merge flag off in this PR", () => {
    expect(SUGGESTION_THREE_WAY_MERGE).toBe(false);
  });

  it("returns null for legacy frozen-diff payloads", () => {
    const content = serializeAiFixCommentContent({
      deleteText: "68 percent",
      insertText: "68 percent versus the 80 percent limit",
      reasoning: "Name the spec.",
    });
    expect(readSuggestionRecord(content)).toBeNull();
    expect(
      mergeStoredSuggestion({
        commentContent: content,
        current: doc(para("The assay failed at 68 percent.")),
      })
    ).toBeNull();
  });

  it("round-trips base and intent on a new ai_fix payload", () => {
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
    expect(record).not.toBeNull();
    const content = serializeAiFixCommentContent(
      withSuggestionRecord(
        {
          deleteText: "68 percent",
          insertText: "68 percent versus the 80 percent limit",
          reasoning: "Name the spec.",
        },
        record
      )
    );
    const read = readSuggestionRecord(content);
    expect(read?.base).toEqual(record?.base);
    expect(read?.intent).toEqual(record?.intent);
  });

  it("re-merges a stored record against an unchanged current as a clean apply", () => {
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
    const content = serializeAiFixCommentContent(
      withSuggestionRecord(
        {
          deleteText: "68 percent",
          insertText: "68 percent versus the 80 percent limit",
          reasoning: "Name the spec.",
        },
        record
      )
    );
    const merged = mergeStoredSuggestion({
      commentContent: content,
      current: record!.base,
    });
    expect(merged?.status).toBe("clean");
  });
});

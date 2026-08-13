import { describe, expect, it } from "vitest";
import { formatCommentForExport } from "@/lib/comments/export-format";
import {
  serializeAiFixCommentContent,
  serializeAiRedraftCommentContent,
} from "@/lib/ai/suggestion-gating";

describe("formatCommentForExport", () => {
  it("formats ai_fix with both delete and insert text", () => {
    const content = serializeAiFixCommentContent({
      deleteText: "old phrase",
      insertText: "new phrase",
      reasoning: "Clarify the observation.",
    });
    expect(formatCommentForExport({ kind: "ai_fix", content })).toBe(
      'Clarify the observation.\nSuggested change: "old phrase" → "new phrase"'
    );
  });

  it("formats ai_fix insert-only", () => {
    const content = serializeAiFixCommentContent({
      deleteText: "",
      insertText: "Add impact details.",
      reasoning: "",
    });
    expect(formatCommentForExport({ kind: "ai_fix", content })).toBe(
      'Suggested insertion: "Add impact details."'
    );
  });

  it("formats ai_fix delete-only", () => {
    const content = serializeAiFixCommentContent({
      deleteText: "redundant clause",
      insertText: "",
      reasoning: "Remove noise.",
    });
    expect(formatCommentForExport({ kind: "ai_fix", content })).toBe(
      'Remove noise.\nSuggested deletion: "redundant clause"'
    );
  });

  it("formats ai_redraft with markdown stripped to plain text", () => {
    const content = serializeAiRedraftCommentContent({
      markdown: "## Findings\n\n**Bold** result\n\n- First item\n- Second item",
      reasoning: "Rewrite for clarity.",
    });
    const result = formatCommentForExport({ kind: "ai_redraft", content });
    expect(result).toContain("Rewrite for clarity.");
    expect(result).toContain("Findings");
    expect(result).toContain("Bold result");
    expect(result).toContain("• First item");
    expect(result).toContain("• Second item");
    expect(result).not.toContain("**");
    expect(result).not.toContain("##");
  });

  it("passes through human and word_import content unchanged", () => {
    expect(
      formatCommentForExport({
        kind: "human",
        content: "Please clarify this deviation.",
      })
    ).toBe("Please clarify this deviation.");
    expect(
      formatCommentForExport({
        kind: "word_import",
        content: "Imported Word note.",
      })
    ).toBe("Imported Word note.");
  });

  it("falls back sanely for malformed ai_fix JSON", () => {
    expect(
      formatCommentForExport({
        kind: "ai_fix",
        content: "plain insert fallback",
      })
    ).toBe('Suggested insertion: "plain insert fallback"');
  });
});

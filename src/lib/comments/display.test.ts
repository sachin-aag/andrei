import { describe, expect, it, beforeEach } from "vitest";
import { hydrateUserDirectory } from "@/lib/auth/user-directory";
import {
  getAiFixCommentPreview,
  getAiFixCommentTitle,
  getCommentAuthorDisplayName,
  getCommentCardTitle,
} from "./display";
import type { CommentRecord, EvaluationRecord } from "@/types/report";

const evaluation: EvaluationRecord = {
  id: "eval-1",
  reportId: "r1",
  sectionId: "sec",
  section: "define",
  criterionKey: "define.audit",
  criterionLabel: "Audit trail availability",
  status: "not_met",
  reasoning: "Missing continuous availability statement",
  bypassed: false,
  evaluatedContentHash: "x",
  updatedAt: "",
};

const aiComment = (content: string, evaluationId: string | null = "eval-1"): CommentRecord => ({
  id: "c1",
  reportId: "r1",
  parentId: null,
  sectionId: "sec",
  section: "define",
  authorId: "ai",
  content,
  anchorText: "",
  contentPath: "narrative",
  fromPos: 0,
  toPos: 1,
  status: "open",
  kind: "ai_fix",
  source: "app",
  externalAuthorName: null,
  externalAuthorInitials: null,
  externalCommentId: null,
  externalCreatedAt: null,
  locked: false,
  evaluationId,
  createdAt: "2026-01-01T00:00:00Z",
});

describe("getAiFixCommentTitle", () => {
  it("prefers linked criterion label", () => {
    const c = aiComment('{"insertText":"x","deleteText":"","reasoning":""}');
    expect(getAiFixCommentTitle(c, [evaluation])).toBe("Audit trail availability");
  });

  it("uses reasoning when no evaluation link", () => {
    const c = aiComment(
      JSON.stringify({
        insertText: "Long insert",
        deleteText: "",
        reasoning: "Adds explicit date/time placeholders where the prose was vague.",
      }),
      null
    );
    expect(getAiFixCommentTitle(c, [])).toBe(
      "Adds explicit date/time placeholders where the prose was vague."
    );
  });

  it("summarizes insert text when reasoning is empty", () => {
    const c = aiComment(
      JSON.stringify({
        insertText:
          "This contradicts the expected standard that audit trails must be continuously available per site SOP.",
        deleteText: "",
        reasoning: "",
      }),
      null
    );
    const title = getAiFixCommentTitle(c, []);
    expect(title).not.toContain("{");
    expect(title.toLowerCase()).toContain("audit");
  });
});

describe("getAiFixCommentPreview", () => {
  it("returns readable insert text, not JSON", () => {
    const c = aiComment(
      JSON.stringify({
        insertText: "The actual occurrence date and time when the data became unavailable is required.",
        deleteText: "",
        reasoning: "",
      })
    );
    const preview = getAiFixCommentPreview(c);
    expect(preview).not.toContain("deleteText");
    expect(preview).toContain("occurrence date");
  });
});

describe("getCommentCardTitle", () => {
  beforeEach(() => {
    hydrateUserDirectory([
      {
        id: "1",
        name: "Bhargav Patel",
        email: "bhargav@mjbiopharm.com",
        role: "engineer",
        title: "Quality Engineer - Packing",
      },
    ]);
  });

  it("uses author for human comments", () => {
    const human: CommentRecord = {
      ...aiComment("hello"),
      kind: "human",
      authorId: "1",
      evaluationId: null,
    };
    expect(getCommentCardTitle(human, [])).toBe("Bhargav Patel");
  });

  it("uses external author for Word-imported comments", () => {
    const imported: CommentRecord = {
      ...aiComment("Regulatory review: Please confirm…"),
      kind: "word_import",
      source: "word",
      authorId: "word",
      evaluationId: null,
      externalAuthorName: "Regulatory Reviewer",
      externalAuthorInitials: "RR",
    };
    expect(getCommentCardTitle(imported, [])).toBe("Regulatory Reviewer");
    expect(getCommentAuthorDisplayName(imported)).toBe("Regulatory Reviewer");
  });

  it("falls back when Word import has no external author name", () => {
    const imported: CommentRecord = {
      ...aiComment("Quality review: …"),
      kind: "word_import",
      source: "word",
      authorId: "word",
      evaluationId: null,
      externalAuthorName: null,
    };
    expect(getCommentCardTitle(imported, [])).toBe("Word reviewer");
  });
});

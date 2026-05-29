import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { legacyStringToDoc } from "@/lib/tiptap/rich-text";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";
import type { ReportSectionRecord } from "@/types/report";
import type { ReportDocxComment } from "@/lib/export/docx-comments";

describe("Word comment export", () => {
  function baseReport(reportId: string, iso: Date): typeof reports.$inferSelect {
    return {
      id: reportId,
      deviationNo: "DEV/COMMENTS/01",
      date: iso,
      toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
      otherTools: "",
      status: "draft",
      authorId: "598",
      assignedManagerId: null,
      createdAt: iso,
      updatedAt: iso,
    };
  }

  function sectionsWithDefineNarrative(
    reportId: string,
    iso: Date,
    narrative: string
  ): ReportSectionRecord[] {
    return REPORT_SECTION_ROW_ORDER.map((section, i) => ({
      id: `section-${section}-${i}`,
      reportId,
      section,
      content:
        section === "define"
          ? {
              ...EMPTY_CONTENT.define,
              narrative: legacyStringToDoc(narrative),
            }
          : EMPTY_CONTENT[section],
      updatedAt: iso.toISOString(),
    }));
  }

  function textFromDocumentXml(documentXml: string): string {
    return Array.from(documentXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      .map((match) => match[1])
      .join("");
  }

  function commentIdForContent(commentsXml: string, content: string): string {
    const match = new RegExp(
      `<w:comment w:id="(\\d+)"(?:(?!<\\/w:comment>)[\\s\\S])*?${content}`
    ).exec(commentsXml);
    expect(match).not.toBeNull();
    return match?.[1] ?? "";
  }

  it("writes app comments into native Word comment parts", async () => {
    const reportId = "report-comments-export";
    const iso = new Date("2026-01-02T03:04:05.000Z");
    const report = baseReport(reportId, iso);
    const sections = sectionsWithDefineNarrative(
      reportId,
      iso,
      "The critical deviation was observed."
    );
    const comments: ReportDocxComment[] = [
      {
        id: "comment-root",
        parentId: null,
        section: "define",
        contentPath: "narrative",
        authorId: "627",
        content: "Please clarify this deviation.",
        anchorText: "critical deviation",
        status: "open",
        kind: "human",
        source: "app",
        externalAuthorName: null,
        externalAuthorInitials: null,
        externalCreatedAt: null,
        createdAt: iso,
      },
      {
        id: "comment-reply",
        parentId: "comment-root",
        section: "define",
        contentPath: null,
        authorId: "598",
        content: "Clarification added.",
        anchorText: "",
        status: "open",
        kind: "human",
        source: "app",
        externalAuthorName: null,
        externalAuthorInitials: null,
        externalCreatedAt: null,
        createdAt: iso,
      },
    ];

    const buffer = await generateReportDocx({ report, sections, comments });
    const zip = new PizZip(buffer);
    const documentXml = zip.file("word/document.xml")?.asText() ?? "";
    const commentsXml = zip.file("word/comments.xml")?.asText() ?? "";
    const commentsExtendedXml = zip.file("word/commentsExtended.xml")?.asText() ?? "";
    const relsXml = zip.file("word/_rels/document.xml.rels")?.asText() ?? "";
    const contentTypesXml = zip.file("[Content_Types].xml")?.asText() ?? "";

    expect(documentXml).toContain("<w:commentRangeStart");
    expect(documentXml).toContain("<w:commentReference");
    expect(commentsXml).toContain("Please clarify this deviation.");
    expect(commentsXml).toContain("Clarification added.");
    expect(commentsExtendedXml).toContain("paraIdParent");
    expect(relsXml).toContain("comments.xml");
    expect(contentTypesXml).toContain("/word/comments.xml");
  });

  it("does not create overlapping ranges for section and inline comments in the same paragraph", async () => {
    const reportId = "report-overlapping-comments-export";
    const iso = new Date("2026-01-02T03:04:05.000Z");
    const narrative = "Alpha beta gamma delta.";
    const report = baseReport(reportId, iso);
    const sections = sectionsWithDefineNarrative(reportId, iso, narrative);
    const comments: ReportDocxComment[] = [
      {
        id: "comment-whole-paragraph",
        parentId: null,
        section: "define",
        contentPath: "narrative",
        authorId: "627",
        content: "Whole paragraph note.",
        anchorText: narrative,
        status: "open",
        kind: "human",
        source: "app",
        externalAuthorName: null,
        externalAuthorInitials: null,
        externalCreatedAt: null,
        createdAt: iso,
      },
      {
        id: "comment-beta",
        parentId: null,
        section: "define",
        contentPath: "narrative",
        authorId: "627",
        content: "Beta note.",
        anchorText: "beta",
        status: "open",
        kind: "human",
        source: "app",
        externalAuthorName: null,
        externalAuthorInitials: null,
        externalCreatedAt: null,
        createdAt: iso,
      },
      {
        id: "comment-gamma",
        parentId: null,
        section: "define",
        contentPath: "narrative",
        authorId: "627",
        content: "Gamma note.",
        anchorText: "gamma",
        status: "open",
        kind: "human",
        source: "app",
        externalAuthorName: null,
        externalAuthorInitials: null,
        externalCreatedAt: null,
        createdAt: iso,
      },
    ];

    const buffer = await generateReportDocx({ report, sections, comments });
    const zip = new PizZip(buffer);
    const documentXml = zip.file("word/document.xml")?.asText() ?? "";
    const commentsXml = zip.file("word/comments.xml")?.asText() ?? "";
    const wholeParagraphDocxId = commentIdForContent(
      commentsXml,
      "Whole paragraph note."
    );

    expect(textFromDocumentXml(documentXml)).toContain(narrative);
    expect(documentXml).toMatch(
      new RegExp(
        `<w:commentRangeStart w:id="${wholeParagraphDocxId}"\\/>[\\s\\S]*Alpha[\\s\\S]*delta\\.[\\s\\S]*<w:commentRangeEnd w:id="${wholeParagraphDocxId}"\\/>`
      )
    );
  });
});

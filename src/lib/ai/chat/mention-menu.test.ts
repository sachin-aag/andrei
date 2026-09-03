import { describe, expect, it } from "vitest";
import { chatEditableSections, sectionLabel } from "@/lib/ai/chat/fields";
import {
  MENTIONS_ATTACHMENTS_GROUP,
  MENTIONS_PLOTS_GROUP,
  MENTIONS_SECTIONS_GROUP,
  MENTIONS_SHEETS_GROUP,
  buildChatMentionMenu,
  mentionMenuAtPath,
  mentionMenuGroupLabel,
  mentionMenuLeaves,
} from "@/lib/ai/chat/mention-menu";
import type { MentionCandidate } from "@/lib/ai/chat/mention-search";
import type {
  ReportAttachmentFolderRecord,
  ReportAttachmentRecord,
} from "@/types/report";

function folder(
  id: string,
  name: string,
  parentId: string | null = null
): ReportAttachmentFolderRecord {
  return {
    id,
    reportId: "rep_1",
    parentId,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function file(
  id: string,
  filename: string,
  folderId: string | null = null,
  processingStatus: ReportAttachmentRecord["processingStatus"] = "ready"
): ReportAttachmentRecord {
  return {
    id,
    reportId: "rep_1",
    folderId,
    filename,
    description: null,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    pageCount: 3,
    processingStatus,
    processingProgress: processingStatus === "ready" ? 100 : 40,
    processingPage: null,
    processingError: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

function sectionCandidates(documentType: "design_verification" | "quality_risk_assessment" | "investigation_report"): MentionCandidate[] {
  return chatEditableSections(documentType).map((section) => ({
    type: "section",
    id: section,
    label: sectionLabel(section),
  }));
}

describe("buildChatMentionMenu", () => {
  it("puts Attachments first and Document sections second in report mode", () => {
    const sections = sectionCandidates("investigation_report");
    const menu = buildChatMentionMenu({
      targetingAnalytics: false,
      attachments: [file("a1", "coa.pdf")],
      folders: [],
      sections,
      sheets: [],
      analyses: [],
    });

    expect(menu.map((entry) => entry.kind === "group" && entry.id)).toEqual([
      MENTIONS_ATTACHMENTS_GROUP,
      MENTIONS_SECTIONS_GROUP,
    ]);
    expect(mentionMenuGroupLabel(menu, [MENTIONS_SECTIONS_GROUP])).toBe(
      "Document sections"
    );
  });

  it("lists every design-verification section under Document sections", () => {
    const sections = sectionCandidates("design_verification");
    const menu = buildChatMentionMenu({
      targetingAnalytics: false,
      attachments: Array.from({ length: 6 }, (_, i) =>
        file(`a${i}`, `file-${i}.pdf`)
      ),
      folders: [],
      sections,
      sheets: [],
      analyses: [],
    });

    const listed = mentionMenuAtPath(menu, [MENTIONS_SECTIONS_GROUP]);
    expect(listed.map((entry) => entry.kind === "item" && entry.candidate.id)).toEqual(
      chatEditableSections("design_verification")
    );
    expect(listed.length).toBeGreaterThan(8);
  });

  it("lists every quality-risk-assessment section", () => {
    const sections = sectionCandidates("quality_risk_assessment");
    const menu = buildChatMentionMenu({
      targetingAnalytics: false,
      attachments: [],
      folders: [],
      sections,
      sheets: [],
      analyses: [],
    });

    const listed = mentionMenuAtPath(menu, [MENTIONS_SECTIONS_GROUP]);
    expect(listed).toHaveLength(chatEditableSections("quality_risk_assessment").length);
    expect(listed.length).toBeGreaterThan(8);
  });

  it("nests attachment folders and skips files that are not ready", () => {
    const menu = buildChatMentionMenu({
      targetingAnalytics: false,
      attachments: [
        file("root", "root.pdf"),
        file("sop", "sop.pdf", "f1"),
        file("jan", "jan.pdf", "f2"),
        file("busy", "busy.pdf", "f1", "processing"),
      ],
      folders: [folder("f1", "SOPs"), folder("f2", "2026", "f1")],
      sections: [],
      sheets: [],
      analyses: [],
    });

    const attachments = mentionMenuAtPath(menu, [MENTIONS_ATTACHMENTS_GROUP]);
    expect(
      attachments.map((entry) =>
        entry.kind === "group" ? entry.label : entry.candidate.label
      )
    ).toEqual(["SOPs", "root.pdf"]);

    const sops = mentionMenuAtPath(menu, [
      MENTIONS_ATTACHMENTS_GROUP,
      "folder:f1",
    ]);
    expect(
      sops.map((entry) =>
        entry.kind === "group" ? entry.label : entry.candidate.label
      )
    ).toEqual(["2026", "sop.pdf"]);
    expect(sops.some((entry) => entry.kind === "item" && entry.candidate.id === "busy")).toBe(
      false
    );

    const nested = mentionMenuAtPath(menu, [
      MENTIONS_ATTACHMENTS_GROUP,
      "folder:f1",
      "folder:f2",
    ]);
    expect(nested).toEqual([
      {
        kind: "item",
        candidate: expect.objectContaining({
          id: "jan",
          label: "jan.pdf",
          keywords: "SOPs / 2026",
        }),
      },
    ]);
  });

  it("keeps an empty Attachments group so the hierarchy is stable", () => {
    const menu = buildChatMentionMenu({
      targetingAnalytics: false,
      attachments: [file("busy", "busy.pdf", null, "processing")],
      folders: [folder("f1", "Empty")],
      sections: sectionCandidates("investigation_report"),
      sheets: [],
      analyses: [],
    });

    const attachments = menu[0];
    expect(attachments).toMatchObject({
      kind: "group",
      id: MENTIONS_ATTACHMENTS_GROUP,
      sublabel: "None ready",
      children: [],
    });
  });

  it("puts Attachments first and Data sheets second in Analytics mode", () => {
    const sheets: MentionCandidate[] = [
      { type: "sheet", id: "s1", label: "Assay" },
      { type: "sheet", id: "s2", label: "Fermenter A" },
    ];
    const menu = buildChatMentionMenu({
      targetingAnalytics: true,
      attachments: [file("a1", "coa.pdf")],
      folders: [],
      sections: sectionCandidates("investigation_report"),
      sheets,
      analyses: [{ type: "analysis", id: "p1", label: "Assay scatter" }],
    });

    expect(menu.map((entry) => entry.kind === "group" && entry.id)).toEqual([
      MENTIONS_ATTACHMENTS_GROUP,
      MENTIONS_SHEETS_GROUP,
      MENTIONS_PLOTS_GROUP,
    ]);
    expect(mentionMenuAtPath(menu, [MENTIONS_SHEETS_GROUP])).toHaveLength(2);
    expect(mentionMenuGroupLabel(menu, [MENTIONS_SHEETS_GROUP])).toBe("Data sheets");
  });

  it("flattens every leaf for search and chip sync", () => {
    const sections = sectionCandidates("design_verification");
    const menu = buildChatMentionMenu({
      targetingAnalytics: false,
      attachments: [file("a1", "coa.pdf", "f1")],
      folders: [folder("f1", "Evidence")],
      sections,
      sheets: [],
      analyses: [{ type: "analysis", id: "p1", label: "Sixpack" }],
    });

    const leaves = mentionMenuLeaves(menu);
    expect(leaves.some((item) => item.id === "a1")).toBe(true);
    expect(leaves.filter((item) => item.type === "section")).toHaveLength(
      sections.length
    );
    expect(leaves.some((item) => item.id === "p1")).toBe(true);
  });
});

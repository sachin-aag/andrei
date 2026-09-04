import { describe, expect, it } from "vitest";
import {
  ANALYTICS_MAX_DOCUMENT_MENTIONS,
  analyticsSheetMentionCandidates,
  buildAnalyticsMentionBlock,
  mentionedAnalyticsAttachmentIds,
  mentionedAnalyticsAnalysisIds,
  mentionedAnalyticsSheetIds,
  parseAnalyticsChatMentions,
  primaryTaggedSheetId,
  resolveAnalyticsChatMentions,
} from "@/lib/statistical-analysis/mentions";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";
import { CAPABILITY_SIXPACK_NORMAL } from "@/lib/statistical-analysis/types";
import type { ReadyDocumentIndexItem } from "@/lib/attachments/retrieval";
import type { ReportAnalyticsView } from "@/lib/statistical-analysis/types";

function readyDoc(
  attachmentId: string,
  overrides: Partial<ReadyDocumentIndexItem> = {}
): ReadyDocumentIndexItem {
  return {
    attachmentId,
    filename: `${attachmentId}.pdf`,
    description: null,
    pageCount: 3,
    ingestRunId: `run-${attachmentId}`,
    documentSummary: null,
    ...overrides,
  };
}

function analyticsView(
  overrides: Partial<ReportAnalyticsView> = {}
): ReportAnalyticsView {
  const worksheet = createEmptyWorksheet();
  return {
    id: "ws-1",
    reportId: "report-1",
    worksheet,
    analyses: [],
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("analyticsSheetMentionCandidates", () => {
  it("maps sheet ids and names to mention candidates", () => {
    expect(
      analyticsSheetMentionCandidates([
        { sheetId: "sheet-a", name: "Fermenter A", columnCount: 2 },
        { sheetId: "sheet-b", name: "Assay", columnCount: 1 },
      ])
    ).toEqual([
      {
        type: "sheet",
        id: "sheet-a",
        label: "Fermenter A",
        sublabel: "2 columns",
      },
      {
        type: "sheet",
        id: "sheet-b",
        label: "Assay",
        sublabel: "1 column",
      },
    ]);
  });
});

describe("parseAnalyticsChatMentions", () => {
  it("keeps document, sheet, and analysis mentions", () => {
    expect(
      parseAnalyticsChatMentions([
        { type: "document", id: "att_1" },
        { type: "sheet", id: "data-1" },
        { type: "analysis", id: "ana_1" },
      ])
    ).toEqual([
      { type: "document", id: "att_1" },
      { type: "sheet", id: "data-1" },
      { type: "analysis", id: "ana_1" },
    ]);
  });

  it("drops malformed entries", () => {
    expect(
      parseAnalyticsChatMentions([
        { type: "document", id: "att_1" },
        { type: "section", id: "define" },
        { type: "sheet", id: "   " },
        null,
      ])
    ).toEqual([{ type: "document", id: "att_1" }]);
  });
});

describe("resolveAnalyticsChatMentions", () => {
  it("resolves sheets and analyses against live analytics", () => {
    const worksheet = createEmptyWorksheet();
    const resolved = resolveAnalyticsChatMentions(
      [
        { type: "sheet", id: worksheet.activeSheetId },
        { type: "analysis", id: "sixpack-1" },
        { type: "document", id: "missing" },
      ],
      [readyDoc("att_1")],
      analyticsView({
        worksheet,
        analyses: [
          {
            id: "sixpack-1",
            workspaceId: "ws-1",
            kind: CAPABILITY_SIXPACK_NORMAL,
            title: "Assay",
            stale: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            sourceHash: "hash",
            previewImage: null,
            config: {
              columnId: "c1",
              columnName: "Assay",
              title: "Assay",
              lsl: 90,
              usl: 110,
              target: 100,
            },
            results: {} as never,
          },
        ],
      })
    );

    expect(resolved.sheets).toHaveLength(1);
    expect(resolved.sheets[0]?.sheetId).toBe(worksheet.activeSheetId);
    expect(resolved.analyses[0]?.analysisId).toBe("sixpack-1");
    expect(resolved.analyses[0]?.stale).toBe(true);
    expect(resolved.droppedCount).toBe(1);
    expect(mentionedAnalyticsSheetIds(resolved)).toEqual([worksheet.activeSheetId]);
    expect(mentionedAnalyticsAnalysisIds(resolved)).toEqual(["sixpack-1"]);
    expect(primaryTaggedSheetId(resolved)).toBe(worksheet.activeSheetId);
  });

  it("caps document mentions", () => {
    const docs = Array.from({ length: ANALYTICS_MAX_DOCUMENT_MENTIONS + 2 }, (_, i) =>
      readyDoc(`att_${i}`)
    );
    const mentions = docs.map((doc) => ({
      type: "document" as const,
      id: doc.attachmentId,
    }));
    const resolved = resolveAnalyticsChatMentions(
      mentions,
      docs,
      analyticsView()
    );
    expect(resolved.documents).toHaveLength(ANALYTICS_MAX_DOCUMENT_MENTIONS);
    expect(resolved.droppedCount).toBe(2);
    expect(mentionedAnalyticsAttachmentIds(resolved)).toHaveLength(
      ANALYTICS_MAX_DOCUMENT_MENTIONS
    );
  });
});

describe("buildAnalyticsMentionBlock", () => {
  it("makes tagged documents the complete attachment scope", () => {
    const block = buildAnalyticsMentionBlock({
      documents: [
        {
          attachmentId: "att_1",
          filename: "Mechanical report.pdf",
          description: null,
          pageCount: 10,
          documentSummary: null,
        },
      ],
      sheets: [],
      analyses: [],
      droppedCount: 0,
    });
    expect(block).toContain("complete attachment scope");
    expect(block).toContain("restricted to these files");
    expect(block).not.toContain('scope="all"');
  });

  it("includes sheet and analysis guidance", () => {
    const block = buildAnalyticsMentionBlock({
      documents: [],
      sheets: [
        { sheetId: "data-1", name: "Assay", columnCount: 3 },
      ],
      analyses: [
        {
          analysisId: "plot-1",
          title: "Assay scatter",
          kind: "xy_scatter",
          stale: false,
          summary: "xy_scatter Y vs X n=12",
        },
      ],
      droppedCount: 0,
    });
    expect(block).toContain("Data sheets");
    expect(block).toContain("Pass the tab name as sheetId");
    expect(block).toContain('"Assay"');
    expect(block).not.toContain("[data-1]");
    expect(block).toContain("Saved plots");
    expect(block).toContain("plot_xy_scatter with that analysisId");
    expect(block).toContain("plot_boxplot with that analysisId");
    expect(block).toContain("plot_histogram with that analysisId");
    expect(block).toContain('"Assay scatter" [plot-1]');
  });
});

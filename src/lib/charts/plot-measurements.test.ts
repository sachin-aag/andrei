import { describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { DocumentReviewSession } from "@/lib/ai/chat/document-review";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { executePlotMeasurements } from "@/lib/charts/plot-measurements";
import type { PlotMeasurementsDeps } from "@/lib/charts/plot-measurements";
import { CHART_DISPLAY_WIDTH_PX } from "@/lib/charts/render-chart";
import { parseChartSpec } from "@/lib/charts/chart-spec";
import {
  createSameTurnBlockPairing,
  recordLeadIn,
} from "@/lib/suggestions/same-turn-block-pair";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/attachments/retrieval", () => ({
  searchReportDocuments: vi.fn(),
  readDocumentPage: vi.fn(),
}));

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function narrativeDoc(nodes: JSONContent["content"]): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: nodes }],
  };
}

function baseDeps(overrides: Partial<PlotMeasurementsDeps> = {}): PlotMeasurementsDeps {
  const extractMeasurements = vi.fn(async () => ({
    status: "ok" as const,
    query: "mock-torque",
    rows: TORQUE_MOCK_SPEC.points.map((point) => ({
      seriesLabel: "",
      replicateLabel: point.label,
      value: String(point.y),
      uom: "ozf-in",
      page: 1,
      attachmentId: "att_1",
      numericValue: point.y,
    })),
    limits: TORQUE_MOCK_SPEC.limits,
    uom: "ozf-in",
    sampleSizeMin: null,
    citations: [{ attachmentId: "att_1", page: 1 }],
  }));
  return {
    loadSection: async () => ({
      sectionId: "sec_define",
      content: { narrative: narrativeDoc([{ type: "text", text: "See the figure." }]) },
    }),
    listOpenAiFixes: async () => [],
    insertComment: vi.fn(async () => undefined),
    updateComment: vi.fn(async () => undefined),
    dismissComments: vi.fn(async () => undefined),
    extractMeasurements,
    renderChartPng: async () => ({
      dataUrl: TINY_PNG,
      widthPx: CHART_DISPLAY_WIDTH_PX,
      heightPx: 450,
      rasterWidthPx: 1920,
      rasterHeightPx: 1440,
    }),
    createId: () => "sug-plot-1",
    ...overrides,
  };
}

const ctx = {
  reportId: "report-1",
  canEdit: true,
  documentType: "investigation_report" as const,
  retrievalPolicy: "adaptive" as const,
  documentReview: new DocumentReviewSession(),
};

describe("executePlotMeasurements", () => {
  it("proposes a chart and does not call extract on pending restyle", async () => {
    const extractMeasurements = vi.fn();
    const updateComment = vi.fn<PlotMeasurementsDeps["updateComment"]>(async () => undefined);
    const spec = { ...TORQUE_MOCK_SPEC, citations: [{ attachmentId: "att_1", page: 1 }] };
    const deps = baseDeps({
      extractMeasurements,
      updateComment,
      listOpenAiFixes: async () => [
        {
          id: "sug-existing",
          contentPath: "narrative",
          status: "open",
          content: serializeAiFixCommentContent({
            deleteText: "",
            insertText: "",
            reasoning: "old",
            insertImage: {
              src: TINY_PNG,
              alt: spec.title,
              width: 600,
              mediaId: null,
              chartSpec: spec,
            },
          }),
        },
      ],
    });
    const result = await executePlotMeasurements(
      {
        section: "define",
        targetField: "narrative",
        query: "mock-torque",
        layout: { xAxis: "replicate" },
        reasoning: "Restyle as overlay",
      },
      ctx,
      deps
    );
    expect(result.status).toBe("proposed");
    expect(extractMeasurements).not.toHaveBeenCalled();
    expect(updateComment).toHaveBeenCalledOnce();
    const updated = updateComment.mock.calls[0]![0] as { id: string; content: string };
    expect(updated.id).toBe("sug-existing");
    const parsed = JSON.parse(updated.content) as { insertImage?: { chartSpec?: unknown } };
    expect(parseChartSpec(parsed.insertImage?.chartSpec)?.layout.xAxis).toBe("replicate");
  });

  it("returns replaced for an accepted chart restyle without extracting", async () => {
    const extractMeasurements = vi.fn();
    const insertComment = vi.fn(async () => undefined);
    const spec = { ...TORQUE_MOCK_SPEC, citations: [{ attachmentId: "att_1", page: 1 }] };
    const deps = baseDeps({
      extractMeasurements,
      insertComment,
      loadSection: async () => ({
        sectionId: "sec_define",
        content: {
          narrative: narrativeDoc([
            { type: "text", text: "See the figure." },
            {
              type: "imageInline",
              attrs: {
                src: TINY_PNG,
                alt: spec.title,
                width: 600,
                mediaId: null,
                chartSpec: spec,
              },
            },
          ]),
        },
      }),
    });
    const result = await executePlotMeasurements(
      {
        section: "define",
        targetField: "narrative",
        query: "mock-torque",
        layout: { seriesBy: "none" },
        reasoning: "Restyle the accepted chart",
      },
      ctx,
      deps
    );
    expect(result.status).toBe("replaced");
    expect(extractMeasurements).not.toHaveBeenCalled();
    expect(insertComment).toHaveBeenCalledOnce();
  });

  it("pairs an empty-anchor chart with a same-turn lead-in", async () => {
    const insertComment = vi.fn<PlotMeasurementsDeps["insertComment"]>(
      async () => undefined
    );
    const updateComment = vi.fn<PlotMeasurementsDeps["updateComment"]>(
      async () => undefined
    );
    const pairing = createSameTurnBlockPairing();
    recordLeadIn(pairing, {
      suggestionId: "sug-lead",
      section: "define",
      targetField: "narrative",
      payload: {
        deleteText: "",
        insertText: "The torque scatter follows.",
        reasoning: "intro",
      },
    });
    const deps = baseDeps({ insertComment, updateComment });
    const result = await executePlotMeasurements(
      {
        section: "define",
        targetField: "narrative",
        query: "mock-torque",
        anchorText: "",
        reasoning: "Plot of cited torque values",
      },
      { ...ctx, blockPairing: pairing },
      deps
    );
    expect(result.status).toBe("proposed");
    expect(updateComment).toHaveBeenCalledOnce();
    const updated = updateComment.mock.calls[0]![0] as {
      id: string;
      content: string;
    };
    const patched = JSON.parse(updated.content) as {
      pairedBlockSuggestionId?: string;
      placeBeforePairedBlock?: string;
    };
    expect(patched.pairedBlockSuggestionId).toBe("sug-plot-1");
    expect(patched.placeBeforePairedBlock).toBe("image");
    expect(insertComment).toHaveBeenCalledOnce();
    const inserted = insertComment.mock.calls[0]![0] as { content: string };
    const proposed = JSON.parse(inserted.content) as {
      placeAfterSuggestionId?: string;
    };
    expect(proposed.placeAfterSuggestionId).toBe("sug-lead");
  });
});

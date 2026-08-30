// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalysisPreviewCapture } from "./use-analysis-preview-capture";
import { captureAnalysisPreviewFromElement } from "@/lib/statistical-analysis/capture-analysis-preview";
import { saveAnalysisPreview } from "@/lib/statistical-analysis/client";
import { analysisPreviewMatchKey } from "@/lib/statistical-analysis/preview-image";
import { CAPABILITY_SIXPACK_NORMAL } from "@/lib/statistical-analysis/types";
import type {
  ReportAnalyticsView,
  SixpackAnalysisSummary,
  StatisticalAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import { computeCapabilitySixpackFromValues } from "@/lib/statistical-analysis/sixpack";

vi.mock("@/lib/statistical-analysis/capture-analysis-preview", () => ({
  captureAnalysisPreviewFromElement: vi.fn(),
}));

vi.mock("@/lib/statistical-analysis/client", () => ({
  saveAnalysisPreview: vi.fn(),
}));

const PREVIEW = {
  dataUrl: "data:image/png;base64,NEW",
  widthPx: 600,
  heightPx: 400,
  alt: "Assay",
  chartSpec: null,
};

function sixpack(
  overrides: Partial<SixpackAnalysisSummary> = {}
): SixpackAnalysisSummary {
  const outcome = computeCapabilitySixpackFromValues([10, 12, 11], 0, {
    columnId: "c1",
    columnName: "Assay",
    title: "Assay",
    lsl: 8,
    usl: 16,
    target: 12,
  });
  if (!outcome.ok) throw new Error(outcome.message);
  return {
    id: "an-1",
    workspaceId: "ws-1",
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: "Assay",
    config: {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 8,
      usl: 16,
      target: 12,
    },
    results: outcome.result,
    sourceHash: "hash-1",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    previewImage: null,
    ...overrides,
  };
}

const emptyAnalytics = {
  id: "ws-1",
  reportId: "report-1",
  worksheet: {
    columns: [],
    sheets: [],
    specs: [],
    activeSheetId: "data-1",
  },
  analyses: [],
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies ReportAnalyticsView;

describe("useAnalysisPreviewCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it("recaptures after an in-flight capture is cancelled by a plot edit", async () => {
    const captures: Array<(value: typeof PREVIEW) => void> = [];
    vi.mocked(captureAnalysisPreviewFromElement).mockImplementation(
      () =>
        new Promise((resolve) => {
          captures.push(resolve);
        })
    );
    vi.mocked(saveAnalysisPreview).mockResolvedValue(emptyAnalytics);

    const original = sixpack();
    const edited = sixpack({
      sourceHash: "hash-2",
      config: {
        ...original.config,
        lsl: 9,
        usl: 15,
      },
    });
    const onUploaded = vi.fn();
    const captureRef = { current: document.createElement("div") };

    const { rerender } = renderHook(
      ({ analysis }: { analysis: StatisticalAnalysisSummary }) =>
        useAnalysisPreviewCapture({
          reportId: "report-1",
          analysis,
          captureRef,
          readOnly: false,
          onUploaded,
        }),
      { initialProps: { analysis: original } }
    );

    await act(async () => {});
    expect(captures).toHaveLength(1);

    rerender({ analysis: edited });
    await act(async () => {});
    expect(captures).toHaveLength(2);

    await act(async () => {
      captures[0]!(PREVIEW);
    });
    expect(saveAnalysisPreview).not.toHaveBeenCalled();

    await act(async () => {
      captures[1]!(PREVIEW);
    });
    expect(saveAnalysisPreview).toHaveBeenCalledWith(
      "report-1",
      "an-1",
      PREVIEW,
      analysisPreviewMatchKey(edited)
    );
    expect(onUploaded).toHaveBeenCalledWith(emptyAnalytics);
  });
});

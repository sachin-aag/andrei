import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITY_SIXPACK_NORMAL } from "./types";
import type { StatisticalAnalysisSummary } from "./types";
import { computeCapabilitySixpackFromValues } from "./sixpack";
import { captureAnalysisPreviewFromElement } from "./capture-analysis-preview";
import {
  downloadAnalysis,
  downloadDataUrl,
  downloadTextFile,
} from "./download";
import { downloadAnalysisFigure } from "./download-figure";

vi.mock("./capture-analysis-preview", () => ({
  captureAnalysisPreviewFromElement: vi.fn(),
}));

vi.mock("./download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./download")>();
  return {
    ...actual,
    downloadAnalysis: vi.fn(),
    downloadDataUrl: vi.fn(),
    downloadTextFile: vi.fn(),
  };
});

const STALE_PREVIEW = {
  dataUrl: "data:image/png;base64,OLD",
  widthPx: 600,
  heightPx: 400,
  alt: "Assay (rows 1–5)",
  chartSpec: null,
};

const LIVE_PREVIEW = {
  dataUrl: "data:image/png;base64,NEW",
  widthPx: 600,
  heightPx: 400,
  alt: "Assay (rows 1–5)",
  chartSpec: null,
};

function sampleAnalysis(
  previewImage: StatisticalAnalysisSummary["previewImage"]
): StatisticalAnalysisSummary {
  const outcome = computeCapabilitySixpackFromValues(
    [10, 12, 11, 13, 14],
    0,
    {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay (rows 1–5)",
      lsl: 8,
      usl: 16,
      target: 12,
      rowStart: 1,
      rowEnd: 5,
    }
  );
  if (!outcome.ok) throw new Error(outcome.message);
  return {
    id: "an-1",
    workspaceId: "ws-1",
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: "Assay (rows 1–5)",
    config: {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay (rows 1–5)",
      lsl: 8,
      usl: 16,
      target: 12,
      rowStart: 1,
      rowEnd: 5,
    },
    results: outcome.result,
    sourceHash: "abc",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    previewImage,
  };
}

describe("downloadAnalysisFigure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads a live capture after an edit even when a stale preview is stored", async () => {
    vi.mocked(captureAnalysisPreviewFromElement).mockResolvedValue(LIVE_PREVIEW);
    const element = {} as HTMLElement;

    await downloadAnalysisFigure(sampleAnalysis(STALE_PREVIEW), element);

    expect(downloadDataUrl).toHaveBeenCalledWith(
      "Assay-rows-1-5-capability-sixpack.png",
      LIVE_PREVIEW.dataUrl
    );
    expect(downloadAnalysis).not.toHaveBeenCalled();
    expect(downloadTextFile).not.toHaveBeenCalled();
  });

  it("falls back to the stored preview when live capture is unavailable", async () => {
    vi.mocked(captureAnalysisPreviewFromElement).mockResolvedValue(null);

    await downloadAnalysisFigure(
      sampleAnalysis(STALE_PREVIEW),
      {} as HTMLElement
    );

    expect(downloadAnalysis).toHaveBeenCalledOnce();
    expect(downloadDataUrl).not.toHaveBeenCalled();
  });

  it("uses the stored preview when the plot is not on screen", async () => {
    await downloadAnalysisFigure(sampleAnalysis(STALE_PREVIEW), null);

    expect(captureAnalysisPreviewFromElement).not.toHaveBeenCalled();
    expect(downloadAnalysis).toHaveBeenCalledOnce();
  });
});

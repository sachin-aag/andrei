import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  analysisForSnapshot,
  analyticsRevisionHash,
  analyticsRevisionPayload,
} from "@/lib/analytics-revisions/payload";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";
import type { StatisticalAnalysisSummary } from "@/lib/statistical-analysis/types";

const analysis = {
  id: "an-1",
  workspaceId: "ws-1",
  kind: "capability_sixpack_normal",
  title: "Assay",
  config: {
    columnId: "c1",
    columnName: "Assay",
    title: "Assay",
    lsl: 90,
    usl: 110,
    target: 100,
  },
  results: { n: 2 },
  sourceHash: "abc",
  stale: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  previewImage: {
    dataUrl: "data:image/png;base64,xx",
    widthPx: 1,
    heightPx: 1,
    alt: "preview",
    chartSpec: null,
  },
} as StatisticalAnalysisSummary;

describe("analyticsRevisionPayload", () => {
  it("strips preview images and stale flags from saved analyses", () => {
    const snap = analysisForSnapshot(analysis);
    expect(snap).not.toHaveProperty("previewImage");
    expect(snap).not.toHaveProperty("stale");
    expect(analyticsRevisionHash(analyticsRevisionPayload({
      worksheet: createEmptyWorksheet(),
      analyses: [analysis],
    }))).toBe(
      analyticsRevisionHash(
        analyticsRevisionPayload({
          worksheet: createEmptyWorksheet(),
          analyses: [{ ...analysis, stale: false, previewImage: null }],
        })
      )
    );
  });
});

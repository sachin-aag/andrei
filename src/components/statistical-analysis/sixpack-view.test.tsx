// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SAMPLE_ASSAY_VALUES } from "@/lib/statistical-analysis/sample-data";
import { computeCapabilitySixpackFromValues } from "@/lib/statistical-analysis/sixpack";
import {
  CAPABILITY_SIXPACK_NORMAL,
  type SixpackAnalysisSummary,
} from "@/lib/statistical-analysis/types";
import { SixpackView } from "./sixpack-view";

function summaryFromValues(
  values: number[],
  config: SixpackAnalysisSummary["config"]
): SixpackAnalysisSummary {
  const outcome = computeCapabilitySixpackFromValues(values, 0, config);
  if (!outcome.ok) {
    throw new Error(outcome.message);
  }
  return {
    id: "an-six",
    workspaceId: "ws-1",
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: config.title,
    config,
    results: outcome.result,
    sourceHash: "abc",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("SixpackView spec labels", () => {
  it("labels LSL and USL on the capability histogram", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 90,
      usl: 110,
      target: 100,
    });

    render(
      <SixpackView
        analysis={analysis}
        onRecompute={() => {}}
        onDelete={() => {}}
        recomputing={false}
      />
    );

    expect(screen.getByTestId("sixpack-spec-label-lsl")).toHaveTextContent(
      "LSL 90.00"
    );
    expect(screen.getByTestId("sixpack-spec-label-usl")).toHaveTextContent(
      "USL 110.00"
    );
  });

  it("labels a one-sided spec without inventing the missing limit", () => {
    const analysis = summaryFromValues([...SAMPLE_ASSAY_VALUES], {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 90,
      usl: null,
      target: null,
    });

    render(
      <SixpackView
        analysis={analysis}
        onRecompute={() => {}}
        onDelete={() => {}}
        recomputing={false}
      />
    );

    expect(screen.getByTestId("sixpack-spec-label-lsl")).toHaveTextContent(
      "LSL 90.00"
    );
    expect(screen.queryByTestId("sixpack-spec-label-usl")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { diffAnalyticsRevisions } from "@/lib/analytics-revisions/diff";
import type { AnalyticsRevisionPayload } from "@/lib/analytics-revisions/payload";
import {
  createEmptyWorksheet,
  replaceColumnValues,
} from "@/lib/statistical-analysis/worksheet";

function payload(
  overrides?: Partial<AnalyticsRevisionPayload>
): AnalyticsRevisionPayload {
  return {
    worksheet: createEmptyWorksheet(),
    analyses: [],
    ...overrides,
  };
}

describe("diffAnalyticsRevisions", () => {
  it("lists cell edits by sheet, column, and 1-based row", () => {
    const from = payload();
    const to = payload({
      worksheet: replaceColumnValues(from.worksheet, 0, ["101.5"], "Assay"),
    });
    const diff = diffAnalyticsRevisions(from, to);
    expect(diff.cells).toEqual([
      {
        sheet: "Data",
        column: "Assay",
        row: 1,
        from: "",
        to: "101.5",
      },
    ]);
    expect(diff.columns).toEqual([
      {
        kind: "renamed",
        sheet: "Data",
        from: "C1",
        to: "Assay",
      },
    ]);
  });

  it("lists added and removed analyses", () => {
    const from = payload({
      analyses: [
        {
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
          createdAt: "2026-01-01T00:00:00.000Z",
        } as AnalyticsRevisionPayload["analyses"][number],
      ],
    });
    const to = payload();
    const diff = diffAnalyticsRevisions(from, to);
    expect(diff.analyses).toEqual([
      {
        kind: "removed",
        id: "an-1",
        title: "Assay",
        plotKind: "capability_sixpack_normal",
      },
    ]);
  });
});

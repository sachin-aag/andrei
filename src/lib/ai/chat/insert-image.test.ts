import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { CHART_DISPLAY_WIDTH_PX } from "@/lib/charts/chart-dimensions";
import {
  listLatestUserChatImages,
  parseSectionImageId,
  plotMatchesNamedTokens,
  recentUserMessageText,
  resolveAnalyticsImage,
  resolveChatImage,
  resolveNamedAnalyticsPlot,
  resolveSectionImageLocator,
  sectionImageNotFoundMessage,
  tokenizePlotName,
} from "./insert-image";
import type { StatisticalAnalysisSummary } from "@/lib/statistical-analysis/types";

const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = `data:image/png;base64,${TINY_PNG}`;

function userWithImages(urls: string[]): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: urls.map((url, i) => ({
      type: "file" as const,
      mediaType: "image/png",
      filename: `shot-${i + 1}.png`,
      url,
    })),
  };
}

describe("resolveChatImage", () => {
  it("lists 1-based images on the latest user message", () => {
    const messages: UIMessage[] = [
      userWithImages([PNG]),
      { id: "a", role: "assistant", parts: [{ type: "text", text: "ok" }] },
      userWithImages([PNG, PNG]),
    ];
    const listed = listLatestUserChatImages(messages);
    expect(listed).toHaveLength(2);
    expect(listed[0]!.index).toBe(1);
    expect(listed[0]!.alt).toBe("shot-1");
    expect(resolveChatImage(messages, 2).ok).toBe(true);
  });

  it("rejects a missing index and reports how many images exist", () => {
    const messages = [userWithImages([PNG])];
    const result = resolveChatImage(messages, 3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("index 1–1");
    expect(result.available).toEqual([
      { index: 1, mediaType: "image/png", alt: "shot-1" },
    ]);
  });

  it("explains when the latest turn has no images", () => {
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ];
    const result = resolveChatImage(messages, 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("no attached images");
  });
});

describe("parseSectionImageId", () => {
  it("parses read_section ids and image markers", () => {
    expect(parseSectionImageId("narrative#1")).toEqual({
      targetField: "narrative",
      index: 1,
    });
    expect(parseSectionImageId("rootCause.narrative#2")).toEqual({
      targetField: "rootCause.narrative",
      index: 2,
    });
    expect(parseSectionImageId("[image:3]")).toEqual({
      targetField: null,
      index: 3,
    });
    expect(parseSectionImageId("not-an-id")).toBeNull();
  });
});

describe("resolveSectionImageLocator", () => {
  it("uses read_section id and an explicit source section for cross-section copy", () => {
    const result = resolveSectionImageLocator({
      destSection: "scope",
      destField: "narrative",
      sourceSection: "purpose",
      id: "narrative#1",
    });
    expect(result).toEqual({
      ok: true,
      locator: { section: "purpose", targetField: "narrative", index: 1 },
    });
  });

  it("defaults source section to the destination when it is omitted", () => {
    const result = resolveSectionImageLocator({
      destSection: "scope",
      destField: "narrative",
      index: 1,
    });
    expect(result).toEqual({
      ok: true,
      locator: { section: "scope", targetField: "narrative", index: 1 },
    });
  });

  it("requires id or index", () => {
    const result = resolveSectionImageLocator({
      destSection: "scope",
      destField: "narrative",
      sourceSection: "purpose",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("image.id");
  });
});

describe("sectionImageNotFoundMessage", () => {
  it("explains the destination default when copying without image.section", () => {
    expect(
      sectionImageNotFoundMessage({
        destSection: "scope",
        sourceSection: "scope",
        sourceField: "narrative",
        index: 1,
        listedCount: 0,
        sourceSectionOmitted: true,
      })
    ).toContain("defaults to the destination");
  });
});

describe("resolveAnalyticsImage", () => {
  const plot = {
    id: "anl_1",
    workspaceId: "ws",
    title: "Torque scatter",
    kind: "measurement_scatter" as const,
    sourceHash: "h",
    stale: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    previewImage: {
      dataUrl: PNG,
      widthPx: 600,
      heightPx: 400,
      alt: "Torque scatter",
      chartSpec: null,
    },
    config: {
      query: "torque",
      title: "Torque scatter",
      xLabel: "Unit",
      yLabel: "Torque",
      layout: {
        mode: "combined" as const,
        seriesBy: "none" as const,
        xAxis: "sequential" as const,
        yRange: null,
      },
      lsl: null,
      usl: null,
    },
    results: { specs: [], n: 3, uom: "Nm" },
  };

  it("copies a saved plot preview", () => {
    const result = resolveAnalyticsImage(plot, "anl_1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.image.src).toBe(PNG);
    expect(result.image.alt).toBe("Torque scatter");
    expect(result.image.width).toBe(CHART_DISPLAY_WIDTH_PX);
  });

  it("explains a missing analysisId", () => {
    const result = resolveAnalyticsImage(undefined, "anl_missing");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("anl_missing");
  });

  it("asks the engineer to open Analytics when the preview is missing", () => {
    const result = resolveAnalyticsImage(
      { ...plot, previewImage: null },
      "anl_1"
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("no captured preview");
  });
});

describe("resolveNamedAnalyticsPlot", () => {
  const torque = {
    id: "anl_torque",
    workspaceId: "ws",
    title: "Torque scatter",
    kind: "measurement_scatter" as const,
    sourceHash: "h",
    stale: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    previewImage: {
      dataUrl: PNG,
      widthPx: 600,
      heightPx: 400,
      alt: "Torque scatter",
      chartSpec: null,
    },
    config: {
      query: "torque",
      title: "Torque scatter",
      xLabel: "Unit",
      yLabel: "Torque",
      layout: {
        mode: "combined" as const,
        seriesBy: "none" as const,
        xAxis: "sequential" as const,
        yRange: null,
      },
      lsl: null,
      usl: null,
    },
    results: { specs: [], n: 3, uom: "Nm" },
  } satisfies StatisticalAnalysisSummary;

  const assay = {
    id: "anl_assay",
    workspaceId: "ws",
    title: "Assay sixpack",
    kind: "capability_sixpack_normal" as const,
    sourceHash: "h",
    stale: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    previewImage: {
      dataUrl: PNG,
      widthPx: 600,
      heightPx: 400,
      alt: "Assay sixpack",
      chartSpec: null,
    },
    config: {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay sixpack",
      lsl: 90,
      usl: 110,
      target: 100,
    },
    results: {} as never,
  } satisfies StatisticalAnalysisSummary;

  it("strips insert/section boilerplate from the engineer request", () => {
    expect(
      tokenizePlotName("insert the torque plot into the purpose section")
    ).toEqual(["torque"]);
    expect(
      tokenizePlotName("insert the plot into the methods of measurement section")
    ).toEqual([]);
    expect(tokenizePlotName("insert the plot into the measure section")).toEqual(
      []
    );
    expect(tokenizePlotName("yes insert that one in")).toEqual([]);
    expect(tokenizePlotName("i dont see it")).toEqual([]);
    expect(
      tokenizePlotName(
        "insert a plot into the purpose section for the assays thing"
      )
    ).toEqual(["assays"]);
    expect(tokenizePlotName("insert plot into the devaition section")).toEqual(
      []
    );
    expect(tokenizePlotName("insert plot into the deviation section")).toEqual(
      []
    );
    expect(tokenizePlotName("insert the assays thing")).toEqual(["assays"]);
    expect(tokenizePlotName("yes please do")).toEqual([]);
    expect(plotMatchesNamedTokens(assay, ["torque"])).toBe(false);
    expect(plotMatchesNamedTokens(assay, ["assay"])).toBe(true);
    expect(plotMatchesNamedTokens(assay, ["assays"])).toBe(true);
  });

  it("reads the latest user turns for the named series", () => {
    const messages: UIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "insert the torque plot into purpose" }],
      },
    ];
    expect(recentUserMessageText(messages)).toContain("torque");
  });

  it("lists available plots when they named a series that is not saved", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay],
      userText: "insert the torque plot into the purpose section",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Assay sixpack");
    expect(result.message).toContain("create additional plots in Analytics");
    expect(result.message).toContain("NOT INSERTED");
    expect(result.message).toContain("have not proposed a figure");
    expect(result.message).toContain("Do not call insert_image again this turn");
  });

  it("inserts the named plot even if analysisId pointed at a different figure", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay, torque],
      userText: "insert the torque plot",
    });
    expect(result).toEqual({ ok: true, analysisId: torque.id });
  });

  it("inserts the only saved plot when they name the destination, not a series", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: "wrong-id",
      analyses: [assay],
      userText: "insert the plot into the methods of measurement section",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("inserts the only saved plot when they name Measure, not a series", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: "wrong-id",
      analyses: [assay],
      userText: "insert the plot into the measure section",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("inserts the listed plot when they confirm without repeating the title", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay, torque],
      userText: "yes insert that one in",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("does not treat I don't see it as a named miss", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay],
      userText: "i dont see it",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("inserts the only saved plot when they typo the Deviations destination", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: "wrong-id",
      analyses: [assay],
      userText: "insert plot into the devaition section",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("matches Assay from filler like the assays thing", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: torque.id,
      analyses: [assay, torque],
      userText: "insert the assays thing",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("inserts the listed plot on yes please do", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay, torque],
      userText: "yes please do",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("matches a boxplot by Y column and lists it as a boxplot", () => {
    const boxplot = {
      ...assay,
      id: "anl_box",
      title: "Boxplot of Assay by Lot",
      kind: "boxplot" as const,
      previewImage: {
        ...assay.previewImage,
        alt: "Boxplot of Assay by Lot",
      },
      config: {
        yColumnId: "c1",
        yColumnName: "Assay",
        categoryColumnIds: ["c2"],
        categoryColumnNames: ["Lot"],
        title: "Boxplot of Assay by Lot",
      },
      results: { n: 10, skipped: 0, groups: [] },
    } satisfies StatisticalAnalysisSummary;

    expect(plotMatchesNamedTokens(boxplot, ["assay", "lot"])).toBe(true);
    expect(plotMatchesNamedTokens(boxplot, ["torque"])).toBe(false);

    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay, boxplot],
      userText: "insert the torque plot",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Boxplot of Assay by Lot");
    expect(result.message).toContain("(boxplot)");
    expect(result.message).toContain("Nothing was inserted");
  });

  it("matches Assay when they say assays thing", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay],
      userText: "insert a plot into the purpose section for the assays thing",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("treats yes please do as unnamed and trusts the analysisId", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay, torque],
      userText:
        "insert a plot into the purpose section for the assays thing\nyes please do",
      latestUserText: "yes please do",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("does not treat confirmation as a name that misses the listed plot", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay],
      userText: "insert the torque plot into the purpose section\nyes please do",
      latestUserText: "yes please do",
    });
    expect(result).toEqual({ ok: true, analysisId: assay.id });
  });

  it("still lists available plots when they named a different series", () => {
    const result = resolveNamedAnalyticsPlot({
      analysisId: assay.id,
      analyses: [assay],
      userText: "insert the torque plot",
      latestUserText: "insert the torque plot",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Assay sixpack");
    expect(result.message).toContain("Nothing was inserted");
  });
});

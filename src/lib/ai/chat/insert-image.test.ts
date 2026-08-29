import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  listLatestUserChatImages,
  parseSectionImageId,
  resolveAnalyticsImage,
  resolveChatImage,
  resolveSectionImageLocator,
  sectionImageNotFoundMessage,
} from "./insert-image";

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
    expect(result.image.width).toBe(600);
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
